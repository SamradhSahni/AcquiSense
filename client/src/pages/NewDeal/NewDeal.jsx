import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { 
  Building2, 
  UploadCloud, 
  Rocket, 
  Check, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  File, 
  X, 
  Zap, 
  Cpu, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { createDeal, uploadFiles, startJob } from '../../services/api';
import './NewDeal.css';

const STEPS = [
  { num: '01', label: 'Deal Parameters' },
  { num: '02', label: 'VDR Ingestion' },
  { num: '03', label: 'Agent Deployment' },
];

const ALLOWED_EXTS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md'];

const MODEL_PROFILES = [
  {
    value: 'economy',
    label: 'Economy Tier',
    desc: 'GPT-4o-mini across all 9 domain agents. Optimized for rapid initial screening and low latency.',
    icon: Zap,
    tag: 'Fastest · Low Latency',
  },
  {
    value: 'standard',
    label: 'Standard Tier',
    desc: 'GPT-4o-mini domain agents with GPT-4o synthesis and quality verification gates. Recommended for institutional IC memos.',
    icon: Cpu,
    tag: 'Recommended · High Accuracy',
  },
  {
    value: 'premium',
    label: 'Deep Forensic Tier',
    desc: 'GPT-4o across all 9 domain specialists and cross-domain synthesis. Maximum forensic depth for high-stakes M&A.',
    icon: Sparkles,
    tag: 'Highest Quality · Deep RAG',
  },
];

function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext)) return <FileText size={18} className="nd-file-icon nd-file-icon--pdf" />;
  if (['xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={18} className="nd-file-icon nd-file-icon--sheet" />;
  if (['docx', 'md', 'txt'].includes(ext)) return <FileCode size={18} className="nd-file-icon nd-file-icon--doc" />;
  return <File size={18} className="nd-file-icon" />;
}

export default function NewDeal() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [deal, setDeal] = useState({
    name: '',
    targetCompany: '',
    acquirer: '',
    modelProfile: 'standard',
  });
  const [files, setFiles] = useState([]);
  const [dealId, setDealId] = useState(null);
  const [savedNames, setSavedNames] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [launching, setLaunching] = useState(false);

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...accepted.filter((f) => !names.has(f.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_EXTS.reduce((a, e) => ({ ...a, [`application/${e.slice(1)}`]: [e] }), {}),
    maxSize: 50 * 1024 * 1024,
  });

  const handleStep1 = async () => {
    if (!deal.name.trim()) {
      toast.error('Deal Name is required to initialize vault.');
      return;
    }
    try {
      const created = await createDeal(deal);
      setDealId(created._id);
      setStep(1);
    } catch (e) {
      toast.error('Failed to initialize deal parameters.');
    }
  };

  const handleStep2 = async () => {
    if (files.length === 0) {
      toast.error('Upload at least one virtual data room document.');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadFiles(files, dealId, setUploadPct);
      setSavedNames(result.savedNames || []);
      if (result.errors?.length) {
        toast.error(`${result.errors.length} file(s) failed validation.`);
      }
      toast.success(`${result.count} data room document(s) securely ingested.`);
      setStep(2);
    } catch (e) {
      toast.error('VDR upload failure: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const job = await startJob(dealId, savedNames, deal.modelProfile);
      toast.success('13 Forensic Diligence Agents Dispatched!');
      navigate(`/deals/${dealId}?jobId=${job.jobId}&pythonJobId=${job.pythonJobId}`);
    } catch (e) {
      toast.error('Deployment error: ' + e.message);
      setLaunching(false);
    }
  };

  return (
    <div className="nd">
      <div className="nd__container">
        {/* ── Wizard Header ──────────────────────────────────────────────────── */}
        <div className="nd__header">
          <h1 className="nd__title">Initialize Due Diligence Vault</h1>
          <p className="nd__sub">
            Configure acquisition parameters, ingest virtual data room documents, and deploy forensic AI fleet.
          </p>
        </div>

        {/* ── Connected Laser Stepper ────────────────────────────────────────── */}
        <div className="nd-stepper">
          {STEPS.map((s, i) => {
            const isDone = i < step;
            const isActive = i === step;
            return (
              <React.Fragment key={s.num}>
                <div
                  className={`nd-step ${isActive ? 'nd-step--active' : ''} ${isDone ? 'nd-step--done' : ''}`}
                >
                  <div className="nd-step__node tabular-nums">
                    {isDone ? <Check size={16} /> : s.num}
                  </div>
                  <span className="nd-step__label">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="nd-step__laser-track">
                    <div
                      className="nd-step__laser-fill"
                      style={{ width: i < step ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Main Form Container ────────────────────────────────────────────── */}
        <div className="glass-panel nd__card">
          {/* Step 0: Deal Info & AI Model Tier */}
          {step === 0 && (
            <div className="nd__form">
              <div className="nd__form-header">
                <h2 className="nd__form-title">Step 01 · Acquisition Parameters</h2>
                <p className="nd__form-subtitle">Enter transaction details and select AI reasoning depth.</p>
              </div>

              <div className="nd__field">
                <label className="nd__label">Deal Code / Project Name *</label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="e.g. Project Phoenix / Acme Software Acquisition"
                  value={deal.name}
                  onChange={(e) => setDeal((d) => ({ ...d, name: e.target.value }))}
                  required
                />
              </div>

              <div className="nd__row">
                <div className="nd__field">
                  <label className="nd__label">Target Company</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. CloudScale Systems, Inc."
                    value={deal.targetCompany}
                    onChange={(e) => setDeal((d) => ({ ...d, targetCompany: e.target.value }))}
                  />
                </div>
                <div className="nd__field">
                  <label className="nd__label">Acquiring Entity / Sponsor</label>
                  <input
                    type="text"
                    className="glass-input"
                    placeholder="e.g. Apex Strategic Growth Fund II"
                    value={deal.acquirer}
                    onChange={(e) => setDeal((d) => ({ ...d, acquirer: e.target.value }))}
                  />
                </div>
              </div>

              {/* AI Compute Tier Cards */}
              <div className="nd__field">
                <label className="nd__label">Autonomous AI Compute Tier</label>
                <div className="nd__profiles">
                  {MODEL_PROFILES.map((p) => {
                    const Icon = p.icon;
                    const isSelected = deal.modelProfile === p.value;
                    return (
                      <div
                        key={p.value}
                        className={`glass-panel glass-panel--interactive nd__profile ${
                          isSelected ? 'nd__profile--selected' : ''
                        }`}
                        onClick={() => setDeal((d) => ({ ...d, modelProfile: p.value }))}
                      >
                        <div className="nd__profile-top">
                          <div className="nd__profile-icon-well">
                            <Icon size={18} />
                          </div>
                          <span className="nd__profile-tag">{p.tag}</span>
                        </div>
                        <h4 className="nd__profile-label">{p.label}</h4>
                        <p className="nd__profile-desc">{p.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="nd__actions nd__actions--right">
                <button type="button" className="btn btn-primary" onClick={handleStep1}>
                  <span>Continue to VDR Ingestion</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 1: VDR Upload */}
          {step === 1 && (
            <div className="nd__form">
              <div className="nd__form-header">
                <h2 className="nd__form-title">Step 02 · Virtual Data Room Ingestion</h2>
                <p className="nd__form-subtitle">
                  Upload confidential transaction documents for multi-domain forensic chunking.
                </p>
              </div>

              {/* Interactive Dashed Dropzone */}
              <div
                {...getRootProps()}
                className={`nd__dropzone ${isDragActive ? 'nd__dropzone--active' : ''}`}
              >
                <input {...getInputProps()} />
                <div className="nd__dropzone-icon-well">
                  <UploadCloud size={32} />
                </div>
                <div className="nd__dropzone-title">
                  {isDragActive
                    ? 'Release documents into secure ingestion chamber…'
                    : 'Drag & drop confidential VDR documents, or browse files'}
                </div>
                <div className="nd__dropzone-hint">
                  Supports PDF, DOCX, XLSX, PPTX, CSV, TXT, MD · Up to 50MB per document
                </div>
              </div>

              {/* Selected Files List */}
              {files.length > 0 && (
                <div className="nd__filelist">
                  <div className="nd__filelist-header">
                    <span>Staged Documents ({files.length})</span>
                    <button
                      type="button"
                      className="nd__filelist-clear"
                      onClick={() => setFiles([])}
                    >
                      Clear All
                    </button>
                  </div>
                  {files.map((f, i) => (
                    <div key={i} className="nd__file-item">
                      {getFileIcon(f.name)}
                      <span className="nd__file-name">{f.name}</span>
                      <span className="nd__file-size tabular-nums">
                        {(f.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        type="button"
                        className="nd__file-remove"
                        onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                        title="Remove file"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Telemetry Upload Bar */}
              {uploading && (
                <div className="nd__upload-telemetry">
                  <div className="nd__upload-telemetry-header">
                    <span>Encrypting &amp; Ingesting VDR Data…</span>
                    <span className="tabular-nums">{uploadPct}%</span>
                  </div>
                  <div className="nd__upload-track">
                    <div className="nd__upload-fill" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}

              <div className="nd__actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStep(0)}
                  disabled={uploading}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStep2}
                  disabled={uploading || files.length === 0}
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Ingesting Documents…</span>
                    </>
                  ) : (
                    <>
                      <span>Upload &amp; Verify {files.length} Document{files.length !== 1 ? 's' : ''}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Deployment Launch Pad */}
          {step === 2 && (
            <div className="nd__form nd__form--launch">
              <div className="nd__launch-emblem">
                <Rocket size={38} className="nd__launch-rocket" />
              </div>

              <h2 className="nd__form-title">Pre-Flight Manifest Verified</h2>
              <p className="nd__form-subtitle">
                13 forensic agents are primed to conduct parallel due diligence across 9 domains.
              </p>

              {/* Manifest Table */}
              <div className="glass-panel nd__manifest">
                <div className="nd__manifest-row">
                  <span className="nd__manifest-key">Deal Title</span>
                  <span className="nd__manifest-val">{deal.name}</span>
                </div>
                {deal.targetCompany && (
                  <div className="nd__manifest-row">
                    <span className="nd__manifest-key">Target Entity</span>
                    <span className="nd__manifest-val">{deal.targetCompany}</span>
                  </div>
                )}
                <div className="nd__manifest-row">
                  <span className="nd__manifest-key">VDR Documents</span>
                  <span className="nd__manifest-val tabular-nums">
                    {savedNames.length} document{savedNames.length !== 1 ? 's' : ''} staged
                  </span>
                </div>
                <div className="nd__manifest-row">
                  <span className="nd__manifest-key">AI Compute Tier</span>
                  <span className="nd__manifest-val">
                    {deal.modelProfile.toUpperCase()} TIER
                  </span>
                </div>
                <div className="nd__manifest-row">
                  <span className="nd__manifest-key">Cryptographic Audit Seal</span>
                  <span className="nd__manifest-val nd__manifest-val--secure">
                    <ShieldCheck size={14} />
                    <span>SHA-256 Enabled</span>
                  </span>
                </div>
              </div>

              <div className="nd__actions nd__actions--launch">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStep(1)}
                  disabled={launching}
                >
                  <ArrowLeft size={16} />
                  <span>Modify Files</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary nd__launch-btn"
                  onClick={handleLaunch}
                  disabled={launching}
                >
                  {launching ? (
                    <>
                      <Loader2 size={18} className="spin" />
                      <span>Deploying 13 Forensic Agents…</span>
                    </>
                  ) : (
                    <>
                      <Rocket size={18} />
                      <span>Deploy Forensic Agents Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
