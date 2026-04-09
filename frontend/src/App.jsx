import { useState, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import Fuse from 'fuse.js'
import { Search, X, Loader2, BookOpen, ExternalLink, Send } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL;

// High-contrast large palette — 40+ colors to minimize identical neighbor assignments
const dynastyColors = [
  '#e11d48', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#06b6d4', '#22c55e', '#f97316',
  '#a855f7', '#14b8a6', '#3b82f6', '#eab308', '#d946ef', '#84cc16', '#ef4444', '#0891b2', '#059669', '#dc2626',
  '#ea580c', '#65a30d', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
  '#db2777', '#dc2626', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#0d9488', '#0891b2', '#0284c7', '#2563eb'
];

const getBaseName = (name) => {
  if (!name) return "";
  // We only strip the brackets themselves, not their contents.
  // This groups "(Roman Empire)" with "Roman Empire"
  // But KEEPS "Roman Empire (East)" distinct from "Roman Empire (West)"
  return String(name).replace(/[()]/g, "").trim().toLowerCase();
};

// Stable color map — computed once from all polities at load time
// Uses a spacing algorithm to maximise contrast between sequential assignments
let stableColorMap = {};
function buildColorMap(features) {
  const bases = [...new Set(features.map(f => getBaseName(f.properties?.Name)))];
  bases.sort();
  stableColorMap = {};
  bases.forEach((base, i) => {
    // Large prime jump (13) to ensure adjacent empires in sorted list get very different colors
    stableColorMap[base] = dynastyColors[(i * 13) % dynastyColors.length];
  });
}

const getStableColor = (name) => {
  if (!name) return '#94a3b8';
  const base = getBaseName(name);
  return stableColorMap[base] || '#94a3b8';
};

// Internal controller enabling dynamic bounding box tracking
function MapAutoZoom({ activePolities, autoZoom, selectedPolity }) {
  const map = useMap();
  const lastSelectedPolityRef = useRef(null);
  useEffect(() => {
    if (!selectedPolity) {
      lastSelectedPolityRef.current = null;
      return;
    }

    // Only auto-pan when a NEW selection is made, NOT every year tick
    if (
      autoZoom &&
      selectedPolity &&
      activePolities &&
      activePolities.length > 0 &&
      lastSelectedPolityRef.current !== selectedPolity
    ) {
      lastSelectedPolityRef.current = selectedPolity;
      try {
        const layer = L.geoJSON({ type: "FeatureCollection", features: activePolities });
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 5, animate: true });
        }
      } catch (error) {
        console.error('Failed to auto-zoom map bounds', error);
      }
    }
  }, [activePolities, selectedPolity, autoZoom, map]);
  return null;
}

function MapZoomControls() {
  const map = useMap();

  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: '140px', marginRight: '10px' }}>
      <div className="leaflet-control-zoom leaflet-bar leaflet-control">
        <a
          className="leaflet-control-zoom-in"
          href="#"
          title="Zoom in"
          role="button"
          aria-label="Zoom in"
          onClick={(event) => {
            event.preventDefault();
            map.zoomIn();
          }}
        >
          +
        </a>
        <a
          className="leaflet-control-zoom-out"
          href="#"
          title="Zoom out"
          role="button"
          aria-label="Zoom out"
          onClick={(event) => {
            event.preventDefault();
            map.zoomOut();
          }}
        >
          -
        </a>
      </div>
    </div>
  );
}

function App() {
  const [geoData, setGeoData] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [year, setYear] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [autoZoom, setAutoZoom] = useState(true);
  
  // Search & Isolation logic
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPolity, setSelectedPolity] = useState(null);
  
  const geoRef = useRef(null);
  const [wikiInfo, setWikiInfo] = useState(null);
  const [fetchingWiki, setFetchingWiki] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [chatDocked, setChatDocked] = useState(false); // New state to toggle visibility

  // Load Data
  useEffect(() => {
    async function load() {
      try {
        const [geoRes, anaRes] = await Promise.all([
          fetch(`${API_BASE}/geojson`),
          fetch(`${API_BASE}/analytics`)
        ]);
        if (!geoRes.ok || !anaRes.ok) {
          throw new Error(`Archive API returned ${geoRes.status} and ${anaRes.status}`);
        }
        const geoJSON = await geoRes.json();
        const anaJSON = await anaRes.json();
        
        const features = geoJSON.features || [];
        // Build the stable color map ONCE from all features
        buildColorMap(features);

        setGeoData(features);
        setAnalytics(anaJSON.timeline || []);
        
        if (anaJSON.timeline?.length > 0) {
          setYear(anaJSON.timeline[0].year);
        }
        setLoadError(null);
      } catch (err) {
        console.error("Error loading API data:", err);
        setLoadError(err instanceof Error ? err.message : 'Unable to load archive data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Global Fuse Search setup
  const fuse = useMemo(() => new Fuse(geoData, {
    keys: [
      { name: "properties.Name", weight: 2 },
      { name: "properties.Type", weight: 1 }
    ],
    threshold: 0.4,
    distance: 200,
  }), [geoData]);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length > 2) {
      const results = fuse.search(q);
      // Deduplicate by BASE name — so "Roman Empire" and "Roman Empire (Dominate)" collapse into one
      const seenBase = new Set();
      const filtered = [];
      for (const res of results) {
        const base = getBaseName(res.item.properties.Name);
        if (!seenBase.has(base)) {
          seenBase.add(base);
          filtered.push(res);
          if (filtered.length >= 8) break;
        }
      }
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  };

  const fetchWikipediaContext = async (polityName) => {
    setFetchingWiki(true);
    try {
      const baseName = getBaseName(polityName);
      
      // Step 1: Try direct summary lookup
      let res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(baseName)}`);
      
      // Step 2: If direct fails, try searching for the best title match first
      if (!res.ok) {
        const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(baseName)}&format=json&origin=*`);
        const searchData = await searchRes.json();
        const bestTitle = searchData?.query?.search?.[0]?.title;
        if (bestTitle) {
          res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`);
        }
      }

      if (res.ok) {
        const data = await res.json();
        setWikiInfo({ 
          title: data.title, 
          extract: data.extract, 
          thumbnail: data.thumbnail?.source,
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(baseName)}`
        });
      } else {
        setWikiInfo({ 
          title: baseName, 
          extract: "The historical archive for this entity is deep within the stacks. Manual search recommended.",
          url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(baseName)}`
        });
      }
    } catch {
      setWikiInfo({ title: polityName, extract: "Interference in the data stream. Context unavailable.", url: null });
    }
    setFetchingWiki(false);
  };

  // Derived ranges for Isolated Empire to aid simulated answering
  const timelineMin = useMemo(() => {
    if (!selectedPolity) return analytics.length ? analytics[0].year : -3000;
    const base = getBaseName(selectedPolity);
    const related = geoData.filter(d => getBaseName(d.properties.Name) === base);
    if (!related.length) return -3000;
    return Math.min(...related.map(d => d.properties.FromYear));
  }, [selectedPolity, geoData, analytics]);

  const timelineMax = useMemo(() => {
    if (!selectedPolity) return analytics.length ? analytics[analytics.length - 1].year : 2000;
    const base = getBaseName(selectedPolity);
    const related = geoData.filter(d => getBaseName(d.properties.Name) === base);
    if (!related.length) return 2000;
    return Math.max(...related.map(d => d.properties.ToYear));
  }, [selectedPolity, geoData, analytics]);

  const jumpToResult = (feature) => {
    const pName = feature.properties.Name;
    setSearchQuery("");
    setSearchResults([]);
    setPlaying(false);
    
    setSelectedPolity(pName);
    setChatDocked(false); // Ensure it opens
    fetchWikipediaContext(pName);
    
    setChatLog([{ role: 'agent', text: `Hi! I'm the Archive Assistant. Ask me anything about the ${pName}.` }]);
    
    const midYear = Math.floor((feature.properties.FromYear + feature.properties.ToYear) / 2);
    setYear(midYear);
  };

  const clearSelection = () => {
    setSelectedPolity(null);
    setWikiInfo(null);
    setChatLog([]);
    setChatDocked(false);
  };

  const submitChat = () => {
    if (!chatInput.trim()) return;
    const newLog = [...chatLog, { role: 'user', text: chatInput }];
    setChatLog(newLog);
    
    const query = chatInput.toLowerCase();
    setChatInput("");
    
    setTimeout(() => {
      let answer = "Insufficient archive databanks on that particular query. Provide an external LLM API key into the backend module for unconstrained insight.";
      
      // Specifically addressing "when did it start/fall" overriding Wikipedia summary constraints.
      if (query.includes("when") || query.includes("year") || query.includes("fall") || query.includes("start") || query.includes("begin")) {
         answer = `Based on our structural timeline datasets, it emerged roughly around ${timelineMin < 0 ? Math.abs(timelineMin)+' BCE' : timelineMin+' CE'} and ultimately fell or transitioned by ${timelineMax < 0 ? Math.abs(timelineMax)+' BCE' : timelineMax+' CE'}.`;
      } 
      // General Naive Wikipedia extraction
      else if (wikiInfo && wikiInfo.extract) {
        const sentences = wikiInfo.extract.split(". ");
        const words = query.split(" ").filter(w => w.length > 3);
        
        let bestMatch = "";
        for (let s of sentences) {
          if (words.some(w => s.toLowerCase().includes(w))) {
            bestMatch = s;
            break;
          }
        }
        if (bestMatch) {
          answer = `Based on retrieved historical archives: ${bestMatch}.`;
        } else if (query.includes("where") || query.includes("location") || query.includes("region")) {
          answer = `Geographically it spans across the dynamically illuminated polygons currently rendered over the 2D Tracker Atlas directly visible on the map.`;
        } else {
          answer = `Archive lookup summary overview: ${wikiInfo.extract.substring(0, 110)}...`;
        }
      }
      setChatLog(prev => [...prev, { role: 'agent', text: answer }]);
    }, 600);
  };

  const activePolities = useMemo(() => {
    let filtered = geoData;
    if (selectedPolity) {
      const baseSelected = getBaseName(selectedPolity);
      filtered = filtered.filter(f => getBaseName(f.properties.Name) === baseSelected);
    }
    return filtered.filter(d => 
      d.properties.FromYear <= year && d.properties.ToYear >= year
    );
  }, [year, geoData, selectedPolity]);

  // Synchronize Leaflet GeoJSON layer data manually for performance (no flicker)
  // We manually apply styles and popups since .addData() doesn't inherit React props
  useEffect(() => {
    if (geoRef.current) {
      geoRef.current.clearLayers();
      geoRef.current.addData({ type: "FeatureCollection", features: activePolities });
      
      geoRef.current.eachLayer(layer => {
        const feature = layer.feature;
        const color = getStableColor(feature.properties.Name);
        
        layer.setStyle({
          color: 'rgba(255,255,255,0.4)',
          weight: 1,
          fillColor: color,
          fillOpacity: 0.7
        });

        layer.bindPopup(`
          <div style="background: #0f172a; color: white; padding: 10px; border-radius: 8px; min-width: 140px; border: 1px solid rgba(255,255,255,0.2)">
            <h3 style="color:${color}; margin: 0 0 5px 0; font-family: 'Outfit'; font-size: 16px;">${feature.properties.Name}</h3>
            <div style="font-size: 12px; margin-bottom: 3px;"><b>Type:</b> ${feature.properties.Type || 'Empire'}</div>
            <div style="font-size: 11px; color: #94a3b8;"><b>Arc:</b> ${feature.properties.FromYear} to ${feature.properties.ToYear}</div>
          </div>
        `, { closeButton: false, offset: [0, -15], className: 'custom-tip' });

        layer.on('click', () => {
          setSelectedPolity(feature.properties.Name);
          setChatDocked(false);
          fetchWikipediaContext(feature.properties.Name);
        });
        
        layer.on('mouseover', () => {
           layer.setStyle({ fillOpacity: 0.9, weight: 3, color: '#fff' });
           layer.openPopup();
        });
        layer.on('mouseout', () => {
           layer.setStyle({ fillOpacity: 0.7, weight: 1, color: 'rgba(255,255,255,0.4)' });
           layer.closePopup();
        });
      });
    }
  }, [activePolities]);

  useEffect(() => {
    let interval;
    if (playing) {
      interval = setInterval(() => {
        setYear(y => {
          if (y >= timelineMax) return timelineMin;
          return y + 25;
        });
      }, 1500); 
    }
    return () => clearInterval(interval);
  }, [playing, timelineMax, timelineMin]);

  if (loading) {
    return (
      <div className="loader">
        <div style={{ textAlign: 'center' }}>
          <svg width="130" height="130" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '20px', filter: 'drop-shadow(0 0 20px rgba(14,165,233,0.4))' }}>
            <defs>
              <linearGradient id="lGold2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <radialGradient id="lBall2" cx="40%" cy="35%" r="60%">
                <stop offset="0%" stopColor="#1e40af" />
                <stop offset="100%" stopColor="#0f172a" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="80" fill="url(#lBall2)" />
            <path d="M 28 67 A 80 80 0 0 1 172 67 Q 100 87 28 67" fill="url(#lGold2)" />
            <path d="M 18 105 Q 55 85 100 105 T 182 105" fill="none" stroke="#2dd4bf" strokeWidth="10" strokeLinecap="round" opacity="0.9"/>
            <path d="M 22 138 Q 60 118 100 138 T 178 138" fill="none" stroke="#0ea5e9" strokeWidth="7" strokeLinecap="round" opacity="0.7"/>
          </svg>
          <h2 style={{ fontFamily: 'Outfit, Inter, sans-serif', letterSpacing: '2px', color: '#93c5fd' }}>Initializing Global Archives...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Universal 2D Atlas - No max bounds, fully swipable horizontal world. */}
      {/* minZoom strictly locks zooming into grey infinity vertically */}
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        minZoom={2}
        zoomControl={false} // Move to bottom right
        attributionControl={false} // Clean map
        worldCopyJump={true} 
        style={{ height: '100vh', width: '100vw', background: '#050510' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <GeoJSON ref={geoRef} data={{ type: "FeatureCollection", features: [] }} />
        <MapAutoZoom activePolities={activePolities} autoZoom={autoZoom} selectedPolity={selectedPolity} />
        <MapZoomControls />
      </MapContainer>

      {loadError && (
        <div className="api-banner" role="status">
          Archive API unavailable. {loadError}
        </div>
      )}

      {/* COMPONENT 1: Top Left Search Engine block */}
      <div className="top-left-panel">
        <div className="logo-area" style={{ display: 'flex', justifyContent: 'center', marginBottom: '5px' }}>
          <svg width="260" height="70" viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 6px 20px rgba(14,165,233,0.4))' }}>
            <defs>
              <linearGradient id="premiumGold" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
              <linearGradient id="skyFlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fff" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <radialGradient id="deepBall" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#020617" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="url(#deepBall)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
            <path d="M 8 30 A 46 46 0 0 1 92 30 Q 50 42 8 30" fill="url(#premiumGold)" />
            <path d="M 5 55 Q 28 42 50 55 T 95 55" fill="none" stroke="#22d3ee" strokeWidth="7" strokeLinecap="round" />
            <path d="M 12 75 Q 33 62 50 75 T 88 75" fill="none" stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
            <text x="106" y="70" fontFamily="'Outfit', sans-serif" fontSize="50" fontWeight="900" fill="url(#skyFlow)" letterSpacing="-2">EmpireFlow</text>
          </svg>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="search-box" style={{ flex: 1 }}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search Dynasty, Empire, Region..."
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
          {selectedPolity && chatDocked && (
            <button className="reopen-chat" onClick={() => setChatDocked(false)} title="Restore Archives">
              <BookOpen size={20} color="#fb923c" />
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((res, idx) => (
              <div key={idx} className="search-item" onClick={() => jumpToResult(res.item)}>
                <strong>{res.item.properties.Name}</strong>
                <span>{res.item.properties.FromYear} to {res.item.properties.ToYear}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COMPONENT 2: Right-Side Floating Wiki panel (Isolated) */}
      {selectedPolity && !chatDocked && (
         <div className="right-wiki-panel">
            <div className="wiki-header">
              <h3><BookOpen size={16} color="#fb923c" /> Entity Intelligence</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setChatDocked(true)} title="Minimize panel while keeping filter active" style={{ padding: '4px' }}>
                  <X size={18}/>
                </button>
                <button onClick={clearSelection} title="Exit Isolation & Restore World View" style={{ padding: '4px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', color: '#ef4444' }}>
                  <Loader2 size={18}/>
                </button>
              </div>
            </div>
            
            {fetchingWiki ? (
              <div className="loader"><Loader2 className="spinner" size={20}/> Decrypting...</div>
            ) : wikiInfo ? (
              <div className="wiki-content">
                {wikiInfo.thumbnail && <img src={wikiInfo.thumbnail} alt="flag" className="wiki-thumb" />}
                <h4>{wikiInfo.title}</h4>
                <p>{wikiInfo.extract}</p>
                
                {wikiInfo.url && (
                  <a href={wikiInfo.url} target="_blank" rel="noreferrer" className="wiki-link">
                    Open Wikipedia Archive <ExternalLink size={12} />
                  </a>
                )}
                
                {/* Simulated RAG Chat Engine */}
                <div className="chat-container">
                  <div className="chat-history">
                    {chatLog.map((msg, i) => (
                      <div key={i} className={`chat-msg ${msg.role}`}>
                        {msg.text}
                      </div>
                    ))}
                  </div>
                  
                  <div className="chat-input-box">
                    <input 
                      type="text" 
                      placeholder="Ask Question (e.g. When did they fall?)" 
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitChat()}
                    />
                    <button onClick={submitChat}><Send size={14}/></button>
                  </div>
                </div>
              </div>
            ) : null}
         </div>
      )}
      
      {/* COMPONENT 3: Bottom Full-Width Horizontal Timeline Slider (Youtube-style) */}
      <div className="bottom-timeline-panel">
        
        {/* Toggle Auto Zoom bounds visually */}
        <div className="zoom-toggle">
           <input type="checkbox" checked={autoZoom} onChange={(e) => setAutoZoom(e.target.checked)}/> 
           <label>Auto-Track Panning</label>
        </div>

        <button onClick={() => setPlaying(!playing)} className="play-btn">
          {playing ? '\u23f8 Pause Evolution' : '\u25b6 Play Timeline'}
        </button>
        
        <div className="year-display">
           {year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`}
        </div>

        <div className="slider-container">
          <input 
            type="range" 
            min={timelineMin} 
            max={timelineMax} 
            step={25}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="slider"
          />
          <span className="stats-label">
             {selectedPolity ? `Isolated Record (Showing ${activePolities.length})` : `Global Output Count: ${activePolities.length}`}
          </span>
        </div>
      </div>
      
    </div>
  )
}

export default App
