/**
 * Web search fallback for leadership data.
 *
 * Uses Brave Search API to find "{company} leadership team executives"
 * and parses the snippets for names + titles as a last resort.
 *
 * This is intentionally lightweight — it fills gaps, not replace ZoomInfo.
 */

const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Search for company leadership via web snippets.
 * Returns best-effort parsed contacts (no emails/phones).
 *
 * @param {string} companyName
 */
export async function searchLeadership(companyName) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return { contacts: [], source: 'Web' };

  const query = `${companyName} executive leadership team CEO CFO COO 2024 2025`;

  const res = await fetch(
    `${BRAVE_API}?q=${encodeURIComponent(query)}&count=10&result_filter=web`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    }
  );

  if (!res.ok) return { contacts: [], source: 'Web' };

  const data = await res.json();
  const snippets = (data.web?.results || []).map(r => `${r.title}\n${r.description}`).join('\n');

  // Very simple heuristic parser — extract "Name, Title" patterns
  const contacts = parseLeadershipSnippets(snippets, companyName);
  return { contacts, source: 'Web Search' };
}

/**
 * Naive regex-based extraction of names and titles from search snippets.
 * Only used as a gap-filler when structured APIs return nothing.
 */
function parseLeadershipSnippets(text, companyName) {
  const contacts = [];
  const seen = new Set();

  // Pattern: "FirstName LastName, Title at Company" or "Title FirstName LastName"
  const patterns = [
    // "John Smith, Chief Executive Officer"
    /([A-Z][a-z]+(?: [A-Z][a-z]+){1,3}),\s*((?:Chief|President|SVP|EVP|VP|Director|Head|Global|Senior)[^,\n.]{3,60})/g,
    // "CEO John Smith"
    /\b(CEO|CFO|COO|CTO|CMO|CPO|CRO|CLO|CIO|CHRO)\b[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const [, a, b] = m;
      // Determine which capture is name vs title
      const nameCandidate = a.length < 40 && /^[A-Z]/.test(a) ? a : b;
      const titleCandidate = a === nameCandidate ? b : a;

      if (!seen.has(nameCandidate.toLowerCase())) {
        seen.add(nameCandidate.toLowerCase());
        contacts.push({
          id: `web-${contacts.length}`,
          name: nameCandidate.trim(),
          title: titleCandidate.trim(),
          department: '',
          email: '',
          phone: '',
          linkedin: '',
          managementLevel: '',
          source: 'Web Search',
        });
      }
    }
  }

  return contacts.slice(0, 20);
}
