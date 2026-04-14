import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import * as d3 from 'd3';

// ─── Constants ────────────────────────────────────────────────────────────────
const CARD_W = 180;
const CARD_H = 72;
const NODE_SEP_X = 210;  // horizontal gap between nodes
const NODE_SEP_Y = 120;  // vertical gap between levels

const LEVEL_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

// ─── Utilities ────────────────────────────────────────────────────────────────
function levelColor(level) {
  return LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
}

function titleLevel(title = '') {
  if (!title) return 5;
  const t = title.toLowerCase();
  if (/\bceo\b|chief executive/.test(t)) return 0;
  if (/\bcfo\b|\bcoo\b|\bcto\b|\bcmo\b|\bcpo\b|\bcro\b|\bclo\b|\bcio\b|\bchro\b|chief\s+\w+\s+officer|president/.test(t)) return 1;
  if (/\bevp\b|\bsvp\b|executive vice|senior vice/.test(t)) return 2;
  if (/\bvp\b|vice president/.test(t)) return 3;
  if (/director|head of|general manager/.test(t)) return 4;
  return 5;
}

// ─── OrgChart SVG component ───────────────────────────────────────────────────
function OrgChart({ data }) {
  const svgRef = useRef(null);
  const [selected, setSelected] = useState(null);

  const buildTree = useCallback(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const root = d3.hierarchy(data);
    const tree = d3.tree().nodeSize([NODE_SEP_X, NODE_SEP_Y]);
    tree(root);

    const nodes = root.descendants();
    const links = root.links();

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - CARD_W / 2);
      maxX = Math.max(maxX, n.x + CARD_W / 2);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    const treeW = maxX - minX + 80;
    const treeH = maxY - minY + 80;

    // Viewport size
    const el = svgRef.current.parentElement;
    const vw = el.clientWidth || 900;
    const vh = el.clientHeight || 600;

    svg.attr('width', vw).attr('height', vh);

    // Drop-shadow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'card-shadow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    filter.append('feDropShadow').attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4).attr('flood-color', 'rgba(0,0,0,0.10)');

    // Zoom container
    const g = svg.append('g');
    const zoom = d3.zoom()
      .scaleExtent([0.2, 2])
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    // Initial transform — center the tree
    const initX = (vw - treeW) / 2 - minX + 40;
    const initY = 40 - minY;
    const scale = Math.min(1, (vw - 80) / treeW, (vh - 80) / treeH);
    svg.call(
      zoom.transform,
      d3.zoomIdentity.translate(vw / 2, 40).scale(scale).translate(-(minX + treeW / 2 - 40), 0)
    );

    // Links
    const linkPath = (lnk) => {
      const sx = lnk.source.x, sy = lnk.source.y + CARD_H;
      const tx = lnk.target.x, ty = lnk.target.y;
      const my = (sy + ty) / 2;
      return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
    };

    g.selectAll('.link')
      .data(links)
      .join('path')
      .attr('class', 'link')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '0');

    // Node groups
    const node = g.selectAll('.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('transform', n => `translate(${n.x - CARD_W / 2}, ${n.y})`)
      .style('cursor', 'pointer')
      .on('click', (e, n) => {
        e.stopPropagation();
        setSelected(s => (s?.data?.id === n.data.id ? null : n.data));
      });

    svg.on('click', () => setSelected(null));

    // Card background
    node.append('rect')
      .attr('width', CARD_W)
      .attr('height', CARD_H)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', 'white')
      .attr('stroke', n => {
        const lv = titleLevel(n.data.title);
        return levelColor(lv);
      })
      .attr('stroke-width', 1.5)
      .attr('filter', 'url(#card-shadow)');

    // Top accent bar
    node.append('rect')
      .attr('width', CARD_W)
      .attr('height', 4)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', n => levelColor(titleLevel(n.data.title)));

    // Fix top-left corner of accent bar (it's fully rounded, we want only top rounded)
    node.append('rect')
      .attr('y', 2)
      .attr('width', CARD_W)
      .attr('height', 4)
      .attr('fill', n => levelColor(titleLevel(n.data.title)));

    // Name
    node.append('text')
      .attr('x', CARD_W / 2)
      .attr('y', 24)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', '600')
      .attr('fill', '#0f172a')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text(n => truncate(n.data.name, 22));

    // Title
    node.append('text')
      .attr('x', CARD_W / 2)
      .attr('y', 44)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#64748b')
      .attr('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif")
      .text(n => truncate(n.data.title, 28));

    // Child count badge
    node.filter(n => n.children && n.children.length > 0)
      .append('circle')
      .attr('cx', CARD_W - 10)
      .attr('cy', CARD_H - 10)
      .attr('r', 9)
      .attr('fill', n => levelColor(titleLevel(n.data.title)));

    node.filter(n => n.children && n.children.length > 0)
      .append('text')
      .attr('x', CARD_W - 10)
      .attr('y', CARD_H - 10)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', 9)
      .attr('font-weight', '700')
      .attr('fill', 'white')
      .text(n => n.children.length);

  }, [data]);

  useEffect(() => {
    buildTree();
    const observer = new ResizeObserver(buildTree);
    if (svgRef.current?.parentElement) observer.observe(svgRef.current.parentElement);
    return () => observer.disconnect();
  }, [buildTree]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {selected && <ContactPanel contact={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─── Contact detail panel ─────────────────────────────────────────────────────
function ContactPanel({ contact, onClose }) {
  const lv = titleLevel(contact.title);
  const color = levelColor(lv);

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16,
      width: 280, background: 'white', borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ height: 6, background: color }} />
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 2 }}>
              {contact.name}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              {contact.title}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18, lineHeight: 1, padding: 0, marginLeft: 8 }}
          >×</button>
        </div>

        {contact.department && (
          <InfoRow label="Department" value={contact.department} />
        )}
        {contact.email && (
          <InfoRow label="Email" value={<a href={`mailto:${contact.email}`} style={{ color: '#6366f1', textDecoration: 'none' }}>{contact.email}</a>} />
        )}
        {contact.phone && (
          <InfoRow label="Phone" value={contact.phone} />
        )}
        {contact.linkedin && (
          <InfoRow label="LinkedIn" value={
            <a href={contact.linkedin} target="_blank" rel="noreferrer" style={{ color: '#6366f1', textDecoration: 'none' }}>View Profile →</a>
          } />
        )}
        {contact.source && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <span style={{
              fontSize: 10, background: '#f1f5f9', color: '#64748b',
              borderRadius: 4, padding: '2px 7px', fontWeight: 500,
            }}>
              Source: {contact.source}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#334155' }}>{value}</div>
    </div>
  );
}

// ─── Search screen ────────────────────────────────────────────────────────────
function SearchScreen({ onSearch }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onSearch(value.trim());
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f8fafc', padding: 24,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Logo area */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <circle cx="12" cy="4" r="2.5" /><circle cx="4" cy="16" r="2.5" /><circle cx="20" cy="16" r="2.5" />
            <line x1="12" y1="6.5" x2="4" y2="13.5" stroke="white" strokeWidth="1.8" /><line x1="12" y1="6.5" x2="20" y2="13.5" stroke="white" strokeWidth="1.8" />
          </svg>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', margin: 0 }}>OrgChart</h1>
        <p style={{ color: '#64748b', marginTop: 8, fontSize: 15 }}>
          Search any company to see their leadership hierarchy
        </p>
      </div>

      {/* Search box */}
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Company name (e.g. Nike, Workday, Salesforce)"
            disabled={loading}
            style={{
              flex: 1, padding: '14px 18px', borderRadius: 10, fontSize: 15,
              border: '1.5px solid #e2e8f0', outline: 'none', background: 'white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              color: '#0f172a',
            }}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !value.trim()}
            style={{
              padding: '14px 24px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              background: loading ? '#c7d2fe' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(99,102,241,0.3)', whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Searching…' : 'Search →'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </form>

      {/* Example chips */}
      <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Nike', 'Workday', 'Salesforce', 'ServiceNow', 'Snowflake'].map(co => (
          <button
            key={co}
            onClick={() => { setValue(co); }}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 13,
              background: 'white', border: '1px solid #e2e8f0', color: '#64748b',
              cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            {co}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Chart header ─────────────────────────────────────────────────────────────
function ChartHeader({ company, sources, contactCount, onBack }) {
  return (
    <div style={{
      height: 56, background: 'white', borderBottom: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
          padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#475569',
        }}
      >
        ← Back
      </button>

      <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
        {company}
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>
        {contactCount} contacts
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>Sources:</span>
        {(sources || []).map(s => (
          <span key={s} style={{
            fontSize: 11, background: '#f1f5f9', color: '#475569',
            borderRadius: 4, padding: '2px 8px', fontWeight: 500,
          }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen({ company }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f8fafc',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ marginBottom: 20 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" style={{ animation: 'spin 1s linear infinite' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="4" />
          <path d="M24 4 A20 20 0 0 1 44 24" fill="none" stroke="#6366f1" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>
        Building org chart for {company}{dots}
      </div>
      <div style={{ color: '#94a3b8', marginTop: 8, fontSize: 14 }}>
        Querying ZoomInfo, Clay, and web sources
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [screen, setScreen] = useState('search');   // 'search' | 'loading' | 'chart' | 'error'
  const [query, setQuery] = useState('');
  const [chartData, setChartData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSearch = async (company) => {
    setQuery(company);
    setScreen('loading');

    const res = await fetch('/api/orgchart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company }),
    });

    const data = await res.json();

    if (!res.ok || !data.tree) {
      setErrorMsg(data.error || 'No contacts found for this company.');
      setScreen('error');
      return;
    }

    setChartData(data);
    setScreen('chart');
  };

  const handleBack = () => {
    setScreen('search');
    setChartData(null);
  };

  return (
    <>
      <Head>
        <title>{screen === 'chart' && chartData ? `${chartData.company} — OrgChart` : 'OrgChart'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {screen === 'search' && <SearchScreen onSearch={handleSearch} />}

        {screen === 'loading' && <LoadingScreen company={query} />}

        {screen === 'error' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', gap: 16,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}>
            <div style={{ fontSize: 48 }}>😕</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: '#0f172a' }}>Couldn't find contacts</div>
            <div style={{ color: '#64748b', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
              {errorMsg}
            </div>
            <button
              onClick={handleBack}
              style={{
                marginTop: 8, padding: '10px 24px', borderRadius: 10, fontSize: 15, fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white',
                border: 'none', cursor: 'pointer',
              }}
            >
              Try another company
            </button>
          </div>
        )}

        {screen === 'chart' && chartData && (
          <>
            <ChartHeader
              company={chartData.company}
              sources={chartData.sources}
              contactCount={chartData.contactCount}
              onBack={handleBack}
            />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <OrgChart data={chartData.tree} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
