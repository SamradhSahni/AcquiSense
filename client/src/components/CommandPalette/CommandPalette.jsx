import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Command } from 'cmdk';
import { 
  Search, 
  LayoutDashboard, 
  PlusCircle, 
  FileText, 
  Bot, 
  Scale, 
  SearchCode, 
  Grid, 
  GitMerge, 
  MessageSquareWarning, 
  Sliders, 
  FileDiff, 
  Sparkles,
  ArrowRight,
  Building2
} from 'lucide-react';
import { getDeals } from '../../services/api';
import './CommandPalette.css';

export default function CommandPalette({ open, setOpen, onSelectTab, onOpenCopilot }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [deals, setDeals] = useState([]);
  const [search, setSearch] = useState('');

  const isDealView = location.pathname.startsWith('/deals/');

  useEffect(() => {
    const down = (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName))) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      getDeals().then(setDeals).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const runCommand = (command) => {
    setOpen(false);
    command();
  };

  return (
    <div className="command-palette-backdrop" onClick={() => setOpen(false)}>
      <div className="command-palette-container" onClick={(e) => e.stopPropagation()}>
        <Command label="Global Command Palette">
          <div className="command-search-wrapper">
            <Search size={18} className="command-search-icon" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or search deals & findings..."
              className="command-input"
              autoFocus
            />
            <span className="command-kbd">ESC</span>
          </div>

          <Command.List className="command-list">
            <Command.Empty className="command-empty">No results found.</Command.Empty>

            {isDealView && (
              <Command.Group heading="Deal Analysis Tabs" className="command-group">
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('verdict'))}
                >
                  <Scale size={16} className="command-item-icon" />
                  <span>Go / No-Go Verdict & Severity</span>
                  <span className="command-shortcut">Tab 1</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('findings'))}
                >
                  <SearchCode size={16} className="command-item-icon" />
                  <span>All Forensic Findings</span>
                  <span className="command-shortcut">Tab 2</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('heatmap'))}
                >
                  <Grid size={16} className="command-item-icon" />
                  <span>9×4 Risk Heatmap</span>
                  <span className="command-shortcut">Tab 3</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('crossref'))}
                >
                  <GitMerge size={16} className="command-item-icon" />
                  <span>D3 Cross-Domain Compound Graph</span>
                  <span className="command-shortcut">Tab 4</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('questions'))}
                >
                  <MessageSquareWarning size={16} className="command-item-icon" />
                  <span>Analyst Management Questions</span>
                  <span className="command-shortcut">Tab 5</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('actions'))}
                >
                  <Sliders size={16} className="command-item-icon" />
                  <span>Risk Action Center & HITL Review</span>
                  <span className="command-shortcut">Tab 6</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('compare'))}
                >
                  <FileDiff size={16} className="command-item-icon" />
                  <span>Semantic Document Comparator</span>
                  <span className="command-shortcut">Tab 7</span>
                </Command.Item>
                <Command.Item
                  className="command-item"
                  onSelect={() => runCommand(() => onSelectTab && onSelectTab('agents'))}
                >
                  <Bot size={16} className="command-item-icon" />
                  <span>Autonomous Agent Fleet Status</span>
                  <span className="command-shortcut">Tab 8</span>
                </Command.Item>
                <Command.Item
                  className="command-item command-item--ai"
                  onSelect={() => runCommand(() => onOpenCopilot && onOpenCopilot())}
                >
                  <Sparkles size={16} className="command-item-icon command-item-icon--sparkle" />
                  <span>Ask AcquiSense Copilot about this deal</span>
                  <span className="command-shortcut">AI RAG</span>
                </Command.Item>
              </Command.Group>
            )}

            <Command.Group heading="Navigation & Workflows" className="command-group">
              <Command.Item className="command-item" onSelect={() => runCommand(() => navigate('/dashboard'))}>
                <LayoutDashboard size={16} className="command-item-icon" />
                <span>Go to Deal Dashboard</span>
                <span className="command-shortcut">⌘D</span>
              </Command.Item>
              <Command.Item className="command-item" onSelect={() => runCommand(() => navigate('/new'))}>
                <PlusCircle size={16} className="command-item-icon" />
                <span>Start New Due Diligence Deal</span>
                <span className="command-shortcut">⌘N</span>
              </Command.Item>
              <Command.Item className="command-item" onSelect={() => runCommand(() => navigate('/reports'))}>
                <FileText size={16} className="command-item-icon" />
                <span>View Institutional Reports Library</span>
                <span className="command-shortcut">⌘R</span>
              </Command.Item>
            </Command.Group>

            {deals.length > 0 && (
              <Command.Group heading="Active Deals in Pipeline" className="command-group">
                {deals.slice(0, 6).map((deal) => (
                  <Command.Item
                    key={deal._id}
                    className="command-item"
                    onSelect={() => runCommand(() => navigate(`/deals/${deal._id}`))}
                  >
                    <Building2 size={16} className="command-item-icon" />
                    <span className="command-deal-name">{deal.name}</span>
                    {deal.targetCompany && (
                      <span className="command-deal-target">({deal.targetCompany})</span>
                    )}
                    <span className={`command-deal-status badge-${deal.status}`}>
                      {deal.status}
                    </span>
                    <ArrowRight size={14} className="command-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="command-footer">
            <span>Navigation: ↑ ↓ · Select: ↵ · Close: ESC</span>
            <span className="command-footer-brand">AcquiSense Forensic AI</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
