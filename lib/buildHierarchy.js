/**
 * buildHierarchy.js
 *
 * Takes a flat array of contacts and constructs a D3-compatible tree
 * rooted at the CEO (or highest-ranking person found).
 *
 * Strategy:
 * 1. Score each contact by title seniority (0 = CEO, 1 = C-suite, 2 = SVP/EVP, 3 = VP, 4 = Director, 5 = Manager)
 * 2. Assign parents: each person reports to the nearest person above them with a related department, or to the root if unclear
 * 3. Return a D3-style tree: { id, name, title, ... children: [...] }
 */

// ─── Seniority scoring ───────────────────────────────────────────────────────

const TITLE_PATTERNS = [
  // Level 0 — CEO / Founder
  { level: 0, patterns: [/\bceo\b/i, /chief executive/i, /founder.*ceo/i, /president.*ceo/i] },
  // Level 1 — C-Suite
  {
    level: 1,
    patterns: [
      /\bcfo\b/i, /\bcoo\b/i, /\bcto\b/i, /\bcmo\b/i, /\bcpo\b/i, /\bcro\b/i,
      /\bclo\b/i, /\bcio\b/i, /\bchro\b/i, /\bcsco\b/i, /\bcso\b/i, /\bcdao\b/i,
      /chief\s+\w+\s+officer/i, /\bpresident\b/i,
    ],
  },
  // Level 2 — EVP / SVP
  { level: 2, patterns: [/\bevp\b/i, /\bsvp\b/i, /executive vice president/i, /senior vice president/i] },
  // Level 3 — VP
  { level: 3, patterns: [/\bvp\b/i, /vice president/i] },
  // Level 4 — Director
  { level: 4, patterns: [/\bdirector\b/i, /\bhead of\b/i, /\bgeneral manager\b/i] },
  // Level 5 — Manager / Sr. Manager
  { level: 5, patterns: [/\bmanager\b/i, /\blead\b/i] },
];

export function titleLevel(title = '') {
  for (const { level, patterns } of TITLE_PATTERNS) {
    if (patterns.some(p => p.test(title))) return level;
  }
  return 6; // unknown
}

// ─── Department grouping ─────────────────────────────────────────────────────

const DEPT_KEYWORDS = {
  finance: ['finance', 'cfo', 'financial', 'accounting', 'treasury', 'investor'],
  engineering: ['engineering', 'cto', 'technology', 'software', 'infrastructure', 'platform', 'data', 'ai', 'ml'],
  product: ['product', 'cpo', 'ux', 'design', 'research'],
  marketing: ['marketing', 'cmo', 'brand', 'demand', 'growth', 'communications', 'pr'],
  sales: ['sales', 'cro', 'revenue', 'partnerships', 'business development', 'bd'],
  hr: ['hr', 'chro', 'people', 'talent', 'culture', 'diversity'],
  legal: ['legal', 'clo', 'counsel', 'compliance', 'privacy', 'regulatory', 'government'],
  operations: ['coo', 'operations', 'supply chain', 'logistics', 'facilities'],
  customer: ['customer', 'cco', 'success', 'support', 'experience', 'service'],
  security: ['security', 'ciso', 'trust', 'safety'],
};

function guessDepartment(contact) {
  if (contact.department) return contact.department.toLowerCase();
  const text = `${contact.title} ${contact.name}`.toLowerCase();
  for (const [dept, keywords] of Object.entries(DEPT_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return dept;
  }
  return 'general';
}

// ─── Deduplication ───────────────────────────────────────────────────────────

export function deduplicateContacts(contacts) {
  const seen = new Map(); // normalized name → contact
  const result = [];

  for (const c of contacts) {
    const key = c.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.set(key, c);
      result.push(c);
    } else {
      // Merge: prefer non-empty fields from later source
      const existing = seen.get(key);
      for (const field of ['email', 'phone', 'linkedin', 'title']) {
        if (!existing[field] && c[field]) existing[field] = c[field];
      }
    }
  }

  return result;
}

// ─── Tree builder ────────────────────────────────────────────────────────────

/**
 * Build a reporting hierarchy from a flat contacts list.
 *
 * @param {Array} contacts  Normalized contact objects
 * @param {string} companyName
 * @returns {{ id, name, title, children, ... }} D3-compatible tree root
 */
export function buildHierarchy(contacts, companyName) {
  if (!contacts || contacts.length === 0) return null;

  // Score and enrich
  const enriched = contacts.map((c, i) => ({
    ...c,
    id: c.id || String(i),
    level: titleLevel(c.title),
    dept: guessDepartment(c),
    children: [],
  }));

  // Sort by level ascending (CEO first)
  enriched.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  // Find root (CEO or best available)
  const root = enriched[0];

  // Group by department
  const byDept = {};
  for (const c of enriched) {
    if (c.id === root.id) continue;
    if (!byDept[c.dept]) byDept[c.dept] = [];
    byDept[c.dept].push(c);
  }

  // Find the "department head" for each dept group (lowest level number = most senior)
  const deptHeads = {};
  for (const [dept, members] of Object.entries(byDept)) {
    members.sort((a, b) => a.level - b.level);
    deptHeads[dept] = members[0];
  }

  // Assign parent relationships
  const nodeMap = {};
  for (const c of enriched) nodeMap[c.id] = c;

  // C-suite / Presidents → root
  // VPs → their C-suite dept head (or root if no dept head)
  // Directors → their VP (or C-suite)
  // Managers → their Director (or VP)

  const assigned = new Set([root.id]);

  for (const c of enriched) {
    if (c.id === root.id) continue;

    let parent = null;

    if (c.level <= 1) {
      // C-suite reports to CEO
      parent = root;
    } else {
      // Find the most senior person above this level in the same department
      const deptPeers = (byDept[c.dept] || []).filter(
        p => p.id !== c.id && p.level < c.level
      );
      deptPeers.sort((a, b) => a.level - b.level);
      parent = deptPeers[0];

      // Fall back to C-suite of related dept, then to root
      if (!parent) {
        // Try cross-dept C-suite match
        const cSuite = enriched.filter(p => p.level === 1 && p.dept === c.dept);
        parent = cSuite[0] || root;
      }
    }

    if (parent && parent.id !== c.id) {
      nodeMap[parent.id].children = nodeMap[parent.id].children || [];
      nodeMap[parent.id].children.push(c);
      assigned.add(c.id);
    }
  }

  // Any unassigned nodes go directly under root
  for (const c of enriched) {
    if (!assigned.has(c.id)) {
      root.children.push(c);
    }
  }

  // Collect unique sources
  const sources = [...new Set(enriched.map(c => c.source).filter(Boolean))];

  return {
    ...root,
    companyName,
    sources,
  };
}
