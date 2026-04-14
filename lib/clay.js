/**
 * Clay API client (REST)
 * Used as an enrichment fallback when ZoomInfo returns thin results.
 *
 * Clay doesn't have a public contact-search REST API like ZoomInfo;
 * we call their People Enrichment endpoint with a domain to get leadership.
 *
 * Docs: https://docs.clay.com/api-reference
 */

const CLAY_API = 'https://api.clay.com/v1';

/**
 * Find contacts at a company using Clay's people enrichment.
 *
 * @param {string} companyDomain - e.g. "nike.com"
 * @param {number} maxResults
 */
export async function searchContacts(companyDomain, maxResults = 30) {
  const apiKey = process.env.CLAY_API_KEY;
  if (!apiKey) throw new Error('CLAY_API_KEY not set');

  // Clay's company people enrichment endpoint
  const res = await fetch(`${CLAY_API}/enrichment/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      company_domain: companyDomain,
      filters: {
        seniority: ['c_suite', 'vp', 'director', 'manager'],
      },
      limit: maxResults,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clay enrichment failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const contacts = (data.people || data.results || []).map(normalizeContact);
  return { contacts, source: 'Clay' };
}

/**
 * Resolve a company domain from a company name using Clay.
 */
export async function resolveCompanyDomain(companyName) {
  const apiKey = process.env.CLAY_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${CLAY_API}/enrichment/company`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ company_name: companyName }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.domain || data.website || null;
}

function normalizeContact(c) {
  return {
    id: String(c.id || c.linkedin_url || Math.random()),
    name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' '),
    title: c.title || c.job_title || '',
    department: c.department || '',
    email: c.email || '',
    phone: c.phone || '',
    linkedin: c.linkedin_url || '',
    managementLevel: c.seniority || '',
    source: 'Clay',
  };
}
