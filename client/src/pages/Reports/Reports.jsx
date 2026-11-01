import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  OctagonAlert, 
  ArrowRight, 
  FileText, 
  Shield, 
  Sparkles 
} from 'lucide-react';
import { getReports } from '../../services/api';
import './Reports.css';

const VERDICT_CONFIG = {
  'GO': {
    icon: CheckCircle2,
    badgeClass: 'report-verdict--go',
    label: 'GO',
  },
  'CAUTION': {
    icon: AlertTriangle,
    badgeClass: 'report-verdict--caution',
    label: 'CAUTION',
  },
  'NO-GO': {
    icon: OctagonAlert,
    badgeClass: 'report-verdict--nogo',
    label: 'NO-GO',
  },
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReports()
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="reports">
      <div className="reports__header">
        <div className="reports__header-pill">
          <Shield size={14} />
          <span>INSTITUTIONAL INTELLIGENCE ARCHIVE</span>
        </div>
        <h1 className="reports__title">Forensic Audit Dossiers</h1>
        <p className="reports__sub">
          Archived Investment Committee memorandums and cryptographic diligence reports
        </p>
      </div>

      {loading ? (
        <div className="reports__loading">
          <div className="reports__loading-pulse">
            <Sparkles className="spin" size={24} />
          </div>
          <span>Decentralizing Report Cache...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="reports__empty glass-panel">
          <div className="reports__empty-icon-well">
            <FileText size={36} />
          </div>
          <h3>No Dossiers Compiled</h3>
          <p>Execute an autonomous 13-agent diligence audit to generate cryptographic IC reports.</p>
          <Link to="/new" className="reports__empty-cta">
            <span>Initialize Diligence Pipeline</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="reports__list">
          {reports.map((r) => {
            const verdict = VERDICT_CONFIG[r.goNoGo] || VERDICT_CONFIG['CAUTION'];
            const VerdictIcon = verdict.icon;
            const dealObj = typeof r.dealId === 'object' ? r.dealId : null;
            const dealName = dealObj?.name || r.dealName || 'Unnamed Deal';
            const targetName = dealObj?.targetCompany || r.targetCompany || 'Confidential Target';
            const dealTargetId = dealObj?._id || r.dealId || r.deal_id;
            const sevDist = r.severityDistribution || {};

            return (
              <div key={r._id} className="report-card glass-panel glass-panel--interactive">
                {/* Left Column: Verdict Seal, Title, Target & Date */}
                <div className="report-card__left">
                  <div className={`report-verdict-seal ${verdict.badgeClass}`}>
                    <VerdictIcon size={14} />
                    <span>{r.goNoGo || 'PENDING'}</span>
                  </div>
                  <h3 className="report-card__name">{dealName}</h3>
                  <div className="report-card__target">
                    <Building2 size={13} />
                    <span>{targetName}</span>
                  </div>
                  <div className="report-card__date tabular-nums">
                    <Calendar size={12} />
                    <span>
                      {new Date(r.createdAt || Date.now()).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Center Column: Executive Summary Dossier */}
                <div className="report-card__center">
                  <div className="report-card__summary-label">EXECUTIVE MEMO EXCERPT</div>
                  <p className="report-card__summary">
                    {r.executiveSummary ? (
                      r.executiveSummary.slice(0, 240) + (r.executiveSummary.length > 240 ? '…' : '')
                    ) : (
                      'Forensic synthesis across 9 diligence domains compiled and verified by quality gates.'
                    )}
                  </p>
                </div>

                {/* Right Column: P0-P3 Cluster & Open Dossier Action */}
                <div className="report-card__right">
                  <div className="report-card__sev-cluster tabular-nums">
                    <span className="report-sev-pill report-sev-pill--p0">
                      P0: <strong>{sevDist.P0 || 0}</strong>
                    </span>
                    <span className="report-sev-pill report-sev-pill--p1">
                      P1: <strong>{sevDist.P1 || 0}</strong>
                    </span>
                    <span className="report-sev-pill report-sev-pill--p2">
                      P2: <strong>{sevDist.P2 || 0}</strong>
                    </span>
                    <span className="report-sev-pill report-sev-pill--p3">
                      P3: <strong>{sevDist.P3 || 0}</strong>
                    </span>
                  </div>

                  <Link to={`/deals/${dealTargetId}`} className="report-card__btn">
                    <span>Open Dossier</span>
                    <ArrowRight size={15} className="report-card__btn-arrow" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
