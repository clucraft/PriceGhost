import { useEffect, useState } from 'react';
import Layout from '../../../layouts/Layout';
import { useAuth } from '../../auth';
import { useToast } from '../../../context/ToastContext';
import { AdminSystemService, RetailerAdminService } from '../../admin';

import { useDebugScraper } from './useDebugScraper';
import DebugControls from './DebugControls';
import ManualConfigSection from './ManualConfigSection';
import ResultDisplay from './ResultDisplay';
import './DebugPage.css';
import Icon from '../../../components/Icon';

export default function Debug() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { state, actions } = useDebugScraper();
  const [activeView, setActiveView] = useState<'results' | 'inspector'>('results');

  // Listen for messages from the picker in the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PG_SELECTOR_PICKED') {
        state.setLiveSelector(event.data.selector);
        showToast('Selector pulled from inspector', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state.setLiveSelector, showToast]);

  const addToSelectors = (type: string, selector: string) => {
    switch(type) {
      case 'price': state.setTempPriceSelectors([...new Set([...state.tempPriceSelectors, selector])]); break;
      case 'deal':
      case 'deal-price': state.setTempDealPriceSelectors([...new Set([...state.tempDealPriceSelectors, selector])]); break;
      case 'member':
      case 'member-price': state.setTempMemberPriceSelectors([...new Set([...state.tempMemberPriceSelectors, selector])]); break;
      case 'original':
      case 'original-price': state.setTempOriginalPriceSelectors([...new Set([...state.tempOriginalPriceSelectors, selector])]); break;
      case 'pre-order':
      case 'pre-order-price': state.setTempPreOrderPriceSelectors([...new Set([...state.tempPreOrderPriceSelectors, selector])]); break;
      case 'name': state.setTempNameSelectors([...new Set([...state.tempNameSelectors, selector])]); break;
      case 'retailer': state.setTempRetailerNameSelectors([...new Set([...state.tempRetailerNameSelectors, selector])]); break;
      case 'image': state.setTempImageSelectors([...new Set([...state.tempImageSelectors, selector])]); break;
      case 'stock': state.setTempStockSelectors([...new Set([...state.tempStockSelectors, selector])]); break;
      case 'exclusion': state.setTempExclusionSelectors([...new Set([...state.tempExclusionSelectors, selector])]); break;
    }
    showToast(`Added selector to ${type} list`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveToRetailer = async () => {
    if (!state.result || !state.url) return;
    try {
      const urlObj = new URL(state.url);
      const domain = urlObj.hostname.replace('www.', '');

      await RetailerAdminService.upsertRetailer({
        domain,
        name: state.result.retailerName,
        use_proxy: state.config.use_proxy,
        use_browser_scraper: state.config.use_browser_scraper,
        user_agent: state.config.user_agent,
        price_selectors: state.tempPriceSelectors,
        retailer_name_selectors: state.tempRetailerNameSelectors,
        deal_price_selectors: state.tempDealPriceSelectors,
        member_price_selectors: state.tempMemberPriceSelectors,
        original_price_selectors: state.tempOriginalPriceSelectors,
        pre_order_price_selectors: state.tempPreOrderPriceSelectors,
        name_selectors: state.tempNameSelectors,
        image_selectors: state.tempImageSelectors,
        stock_selectors: state.tempStockSelectors,
        exclusion_selectors: state.tempExclusionSelectors,
        active: true,
        description: `Saved from Debug Page on ${new Date().toLocaleDateString()}`
      });
      showToast(`Retailer config for ${domain} updated successfully!`);
    } catch (err: any) {
      showToast('Failed to save config: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  if (state.isEnabled === false) {
    return (
      <Layout>
        <div className="container py-4">
          <div className="alert alert-error" style={{ marginTop: '2rem', textAlign: 'center', padding: '3rem' }}>
            <div style={{ marginBottom: '1rem' }}><Icon name="lock" size="3rem" /></div>
            <h2>Debug Access Restricted</h2>
            <p>The public debug page is currently disabled. An administrator can enable it in the System Settings.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container-fluid debug-page">
        <header className="debug-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="header-title">
              <h1><Icon name="wrench" /> Scraper Workstation</h1>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={async () => {
                  try {
                    await AdminSystemService.executeCommand('clear-settings-cache');
                    showToast('System cache refreshed successfully', 'success');
                  } catch {
                    showToast('Failed to refresh system cache', 'error');
                  }
                }}
              >
                Refresh Cache
              </button>
            </div>
          </div>
          {state.isLoading && <div className="loading-bar"></div>}
        </header>

        <div className="debug-grid">
          {/* COL 1: INPUT & CONFIG */}
          <aside className="debug-sidebar">
            {state.recentUrls.length > 0 && (
              <div className="card workstation-card mb-4">
                <div className="card-header"><h3><Icon name="clock" /> Recent</h3></div>
                <div className="card-body p-0">
                  <div className="history-list">
                    {state.recentUrls.map((item, idx) => (
                      <button key={idx} className="history-item" onClick={() => state.setUrl(item.url)}>
                        <span className="history-domain">{item.domain}</span>
                        <span className="history-url">{item.url}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DebugControls state={state} actions={actions}>
              <ManualConfigSection state={state} />
            </DebugControls>
          </aside>

          {/* COL 2: MAIN WORKSTATION VIEW */}
          <main className="debug-main">
            {!state.result && !state.isLoading && (
              <div className="empty-state">
                <div className="empty-icon"><Icon name="flask" size="2.5rem" /></div>
                <h2>Ready for Analysis</h2>
                <p>Enter a URL and select a mode to begin extraction testing.</p>
              </div>
            )}

            {state.result && (
              <div className="workstation-view-container fade-in">
                <div className="view-tabs">
                  <button 
                    className={`view-tab-btn ${activeView === 'results' ? 'active' : ''}`}
                    onClick={() => setActiveView('results')}
                  >
                    <Icon name="barChart" /> Extraction Results
                  </button>
                  <button 
                    className={`view-tab-btn ${activeView === 'inspector' ? 'active' : ''}`}
                    onClick={() => setActiveView('inspector')}
                  >
                    <Icon name="search" /> Interactive Inspector
                  </button>
                </div>

                <div className="view-content">
                  {activeView === 'results' ? (
                    <ResultDisplay 
                      state={{ result: state.result, user, url: state.url }}
                      actions={{ handleSaveToRetailer, addToSelectors, showToast }} 
                    />
                  ) : (
                    <div className="iframe-viewer-container full-height">
                      <div className="inspector-header">
                        <h3><Icon name="search" /> Interactive Inspector</h3>
                        {state.result?.debugFileUrl && (
                          <a href={state.result.debugFileUrl} target="_blank" rel="noreferrer" className="download-link">
                            Full Window
                          </a>
                        )}
                      </div>
                      <iframe 
                        id="debug-iframe"
                        title="Rendered Source"
                        className="iframe-viewer"
                        srcDoc={`
                          <style>
                            /* PriceStalker Debug Overrides: Prevent layout blowouts & Aggressive Flattening */
                            body { 
                              overflow-x: hidden !important; 
                              max-width: 100vw !important; 
                              display: block !important; 
                            }
                            
                            /* Aggressive Structural Flattening */
                            header, footer, nav, aside, section, .header, .footer, .nav, .sidebar {
                              position: static !important;
                              height: auto !important;
                              min-height: 0 !important;
                              max-height: 80px !important;
                              overflow: hidden !important;
                              opacity: 0.6 !important;
                              border: 1px dashed #ccc !important;
                              margin-bottom: 5px !important;
                            }

                            /* Shrink Media out of existence */
                            img, svg, video, canvas, iframe, object { 
                              max-width: 100% !important; 
                              height: auto !important; 
                              object-fit: contain !important; 
                            }
                            
                            /* Target sized images */
                            img[width], img[height], svg[width], svg[height] {
                              max-width: 150px !important;
                              max-height: 150px !important;
                            }
                            
                            /* Force static positioning to fix layout blowouts */
                            * { 
                              box-sizing: border-box !important; 
                              position: static !important; 
                            }
                            
                            /* Preserve highlight/picker overlays */
                            .pg-highlight, #pg-picker-toolbar, #pg-picker-toolbar * {
                              position: fixed !important;
                              max-height: none !important;
                              opacity: 1 !important;
                              z-index: 2147483647 !important;
                            }
                          </style>
                          ${state.result.html}
                        `}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
}
