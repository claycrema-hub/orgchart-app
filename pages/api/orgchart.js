/**
 * POST /api/orgchart
 *
 * Body: { company: "Nike" }
 *
 * 1. Tries ZoomInfo first (richest structured data — name, title, dept, email)
 * 2. Falls back to Clay enrichment if ZoomInfo returns < 3 contacts
 * 3. Fills any remaining gaps with web search snippets
 * 4. Deduplicates and builds a hierarchy tree
 * 5. Returns { tree, sources, contactCount }
 */

import { searchContacts as ziSearch } from '../../lib/zoominfo';
import { searchContacts as claySearch, resolveCompanyDomain } from '../../lib/clay';
import { searchLeadership } from '../../lib/websearch';
import { buildHierarchy, deduplicateContacts } from '../../lib/buildHierarchy';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company } = req.body;
  if (!company || typeof company !== 'string' || company.trim().length < 1) {
    return res.status(400).json({ error: 'Missing company name' });
  }

  const companyName = company.trim();
  const allContacts = [];
  const sourcesUsed = [];
  const errors = [];

  // ── Step 1: Resolve domain (helps ZoomInfo + Clay accuracy) ─────────────
  let domain = null;
  try {
    domain = await resolveCompanyDomain(companyName);
  } catch (e) {
    // Non-fatal — ZoomInfo can still search by name
    errors.push(`Domain resolve: ${e.message}`);
  }

  // ── Step 2: ZoomInfo ─────────────────────────────────────────────────────
  if (process.env.ZOOMINFO_USERNAME && process.env.ZOOMINFO_PASSWORD) {
    try {
      const { contacts, source } = await ziSearch(companyName, domain, 60);
      if (contacts.length > 0) {
        allContacts.push(...contacts);
        sourcesUsed.push(source);
        console.log(`[orgchart] ZoomInfo returned ${contacts.length} contacts for "${companyName}"`);
      }
    } catch (e) {
      errors.push(`ZoomInfo: ${e.message}`);
      console.error('[orgchart] ZoomInfo error:', e.message);
    }
  }

  // ── Step 3: Clay (fallback or supplement) ────────────────────────────────
  if (process.env.CLAY_API_KEY && (allContacts.length < 5 || sourcesUsed.length === 0)) {
    try {
      const clayDomain = domain || guessDomain(companyName);
      const { contacts, source } = await claySearch(clayDomain, 30);
      if (contacts.length > 0) {
        allContacts.push(...contacts);
        sourcesUsed.push(source);
        console.log(`[orgchart] Clay returned ${contacts.length} contacts for "${clayDomain}"`);
      }
    } catch (e) {
      errors.push(`Clay: ${e.message}`);
      console.error('[orgchart] Clay error:', e.message);
    }
  }

  // ── Step 4: Web search (last resort) ─────────────────────────────────────
  if (allContacts.length < 3) {
    try {
      const { contacts, source } = await searchLeadership(companyName);
      if (contacts.length > 0) {
        allContacts.push(...contacts);
        sourcesUsed.push(source);
        console.log(`[orgchart] Web search found ${contacts.length} contacts for "${companyName}"`);
      }
    } catch (e) {
      errors.push(`Web search: ${e.message}`);
    }
  }

  // ── Step 5: Build tree ───────────────────────────────────────────────────
  if (allContacts.length === 0) {
    return res.status(404).json({
      error: 'No contacts found',
      details: errors,
      company: companyName,
    });
  }

  const deduped = deduplicateContacts(allContacts);
  const tree = buildHierarchy(deduped, companyName);

  return res.status(200).json({
    tree,
    sources: [...new Set(sourcesUsed)],
    contactCount: deduped.length,
    company: companyName,
    domain,
    errors: errors.length > 0 ? errors : undefined,
  });
}

/**
 * Very rough domain guesser — only used if Clay domain lookup fails.
 * E.g. "Nike" → "nike.com", "Workday Inc" → "workday.com"
 */
function guessDomain(companyName) {
  const cleaned = companyName
    .toLowerCase()
    .replace(/\b(inc|corp|llc|ltd|co|company|group|holdings|international)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return `${cleaned}.com`;
}
