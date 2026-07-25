import React from 'react';
import { PRESET_USER_AGENTS } from '../../admin/components';
import { RetailerConfig } from '../../../types/api';
import Icon from '../../../components/Icon';

interface DebugControlsProps {
  state: {
    url: string; setUrl: (v: string) => void;
    productIdInput: string; setProductIdInput: (v: string) => void;
    mode: 'normal' | 'simulate' | 'bypass'; setMode: (v: 'normal' | 'simulate' | 'bypass') => void;
    returnHtml: boolean; setReturnHtml: (v: boolean) => void;
    useAI: boolean; setUseAI: (v: boolean) => void;
    forceAI: boolean; setForceAI: (v: boolean) => void;
    useOverride: boolean; setUseOverride: (v: boolean) => void;
    isLoading: boolean;
    isFetchingConfig: boolean;
    config: Partial<RetailerConfig>; setConfig: (v: Partial<RetailerConfig>) => void;
  };
  actions: {
    runExtraction: (e?: React.FormEvent) => Promise<void>;
    loadProductById: () => Promise<void>;
  };
  children?: React.ReactNode; // For the ManualConfigSection injection
}

export default function DebugControls({ state, actions, children }: DebugControlsProps) {
  const { 
    url, setUrl, productIdInput, setProductIdInput, mode, setMode, returnHtml, setReturnHtml, 
    useAI, setUseAI, forceAI, setForceAI, useOverride, setUseOverride, 
    isLoading, isFetchingConfig, config, setConfig 
  } = state;

  return (
    <div className="card workstation-card">
      <div className="card-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3><Icon name="radio" /> Target Input</h3>
          {isFetchingConfig && <small style={{ color: 'var(--primary)' }}><Icon name="zap" /> Syncing Config...</small>}
        </div>
      </div>
      <div className="card-body">
        <div className="form-group mb-4 pb-3 border-bottom">
          <label>Load by Product ID</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-control workstation-input"
              value={productIdInput}
              onChange={(e) => setProductIdInput(e.target.value)}
              placeholder="e.g. 123"
            />
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={actions.loadProductById}
              disabled={isLoading || !productIdInput}
            >
              Load
            </button>
          </div>
        </div>

        <form onSubmit={actions.runExtraction}>
          <div className="form-group mb-3">
            <label>Product URL</label>
            <input
              type="text"
              className="form-control workstation-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL to analyze..."
            />
          </div>

          <div className="mode-selector mb-4">
            <label className="section-label">Analysis Mode</label>
            <div className="mode-grid">
              <button 
                type="button" 
                className={`mode-btn ${mode === 'normal' ? 'active' : ''}`}
                onClick={() => setMode('normal')}
              >
                <span className="mode-icon"><Icon name="flask" /></span>
                <span className="mode-text"><strong>Normal</strong><small>Full Logic</small></span>
              </button>
              <button 
                type="button" 
                className={`mode-btn ${mode === 'simulate' ? 'active' : ''}`}
                onClick={() => setMode('simulate')}
              >
                <span className="mode-icon"><Icon name="refresh" /></span>
                <span className="mode-text"><strong>Simulate</strong><small>Update Path</small></span>
              </button>
              <button 
                type="button" 
                className={`mode-btn ${mode === 'bypass' ? 'active' : ''}`}
                onClick={() => setMode('bypass')}
              >
                <span className="mode-icon"><Icon name="zap" /></span>
                <span className="mode-text"><strong>Bypass</strong><small>Raw Fetch</small></span>
              </button>
            </div>
          </div>

          <div className="form-group mb-3">
            <label className="checkbox-container">
              <input type="checkbox" checked={returnHtml} onChange={e => setReturnHtml(e.target.checked)} />
              <span className="checkmark"></span>
              Include raw HTML payload
            </label>
            <label className="checkbox-container mt-2">
              <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
              <span className="checkmark"></span>
              Enable AI Fallback Extraction
            </label>
            <label className="checkbox-container mt-2">
              <input type="checkbox" checked={forceAI} onChange={e => setForceAI(e.target.checked)} />
              <span className="checkmark"></span>
              Force AI Extraction
            </label>
          </div>

          <div className="form-group mb-3 pt-3 border-top">
            <label className="checkbox-container">
              <input type="checkbox" checked={useOverride} onChange={e => setUseOverride(e.target.checked)} />
              <span className="checkmark"></span>
              Enable Config Overrides
            </label>
          </div>

          {useOverride && (
            <div className="override-panel fade-in">
              <div className="form-group mb-3">
                <label>User Agent</label>
                <select className="form-control workstation-input" value={config.user_agent || ''} onChange={e => setConfig({ ...config, user_agent: e.target.value })}>
                  <option value="">Default Server UA</option>
                  {PRESET_USER_AGENTS.map((ua, idx) => (
                    <option key={idx} value={ua.value}>{ua.label}</option>
                  ))}
                </select>
              </div>

              <div className="toggle-grid mb-3" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label className="toggle-label" style={{ whiteSpace: 'nowrap', minWidth: '80px' }}><input type="checkbox" checked={config.use_proxy || false} onChange={e => setConfig({...config, use_proxy: e.target.checked})} /> Proxy</label>
                <label className="toggle-label" style={{ whiteSpace: 'nowrap', minWidth: '120px' }}><input type="checkbox" checked={config.use_browser_scraper || false} onChange={e => setConfig({...config, use_browser_scraper: e.target.checked})} /> Browser Scraper</label>
              </div>
              
              {children}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary workstation-submit mt-3" 
            disabled={isLoading || !url}
          >
            {isLoading ? 'ANALYZING...' : 'RUN EXTRACTION'}
          </button>
        </form>
      </div>
    </div>
  );
}
