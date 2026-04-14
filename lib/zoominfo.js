/**
 * ZoomInfo REST API client
 * Docs: https://api-docs.zoominfo.com/
 *
 * Authenticates via username + password → JWT, then searches contacts
 * filtered by company name and management level.
 */

const ZOOMINFO_API = 'https://api.zoominfo.com';

let _cachedToken = null;
let _tokenExpiry = 0;

/**
 * Authenticate and return a JWT access token (cached for 60 min).
 */
async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const res = await fetch(`${ZOOMINFO_API}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ZOOMINFO_USERNAME,
      password: process.env.ZOOMINFO_PASSWORD,
      client_id: process.env.ZOOMINFO_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZoomInfo auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  _cachedToken = data.jwt;
  // tokens are valid for 60 min; refresh 5 min early
  _tokenExpiry = Date.now() + 55 * 60 * 1000;
  return _cachedToken;
}

/**
 * Search ZoomInfo contacts at a company.
 * Returns an array of normalized contact objects.
 *
 * @param {string} companyName  - e.g. "Nike"
 * @param {string} companyDomain - e.g. "nike.com" (optional but improves accuracy)
 * @param {number} maxResults   - default 50
 */
export async function searchContacts(companyName, companyDomain, maxResults = 50) {
  const token = await getToken();

  const outputFields = [
    'id', 'firstName', 'lastName', 'jobTitle', 'managementLevel',
    'department', 'email', 'phone', 'linkedInUrl',
    'companyName', 'companyId',
  ];

  const matchCompanyFilter = companyDomain
    ? { website: companyDomain }
    : { name: companyName };

  const body = {
    outputFields,
    searchInput: [
      {
        // Filter to this company
        companyInput: [
          {
            values: [matchCompanyFilter],
          },
        ],
        // Focus on senior leadership
        contactFilterInput: [
          {
            managementLevel: ['C_LEVEL_EXECUTIVE', 'VP_LEVEL', 'DIRECTOR', 'MANAGER'],
          },
        ],
        rpp: maxResults,
        page: 1,
        sortBy: 'managementLevelOrder',
        sortOrder: 'asc',
      },
    ],
  };

  const res = await fetch(`${ZOOMINFO_API}/search/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZoomInfo contact search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const contacts = (data.data?.result || []).map(normalizeContact);
  return { contacts, source: 'ZoomInfo' };
}

/**
 * Normalize a ZoomInfo contact record to our internal shape.
 */
function normalizeContact(c) {
  return {
    id: String(c.id || Math.random()),
    name: [c.firstName, c.lastName].filter(Boolean).join(' '),
    title: c.jobTitle || '',
    department: c.department || '',
    email: c.email || '',
    phone: c.phone || '',
    linkedin: c.linkedInUrl || '',
    managementLevel: c.managementLevel || '',
    source: 'ZoomInfo',
  };
}
