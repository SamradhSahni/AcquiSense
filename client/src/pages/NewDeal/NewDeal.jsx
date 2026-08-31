import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { createDeal, uploadFiles, startJob } from '../../services/api';
import './NewDeal.css';

const STEPS = ['Deal Info', 'Upload Files', 'Launch'];
const ALLOWED_EXTS = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.csv', '.md'];

function StepIndicator({ current }) {
  return (
    <div className="nd-steps">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`nd-step ${i <= current ? 'nd-step--active' : ''} ${i < current ? 'nd-step--done' : ''}`}>
            <div className="nd-step__num">{i < current ? '✓' : i + 1}</div>
            <span className="nd-step__label">{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`nd-step__line ${i < current ? 'nd-step__line--done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function NewDeal() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [deal, setDeal] = useState({ name: '', targetCompany: '', acquirer: '', modelProfile: 'standard' });
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
    if (!deal.name.trim()) { toast.error('Deal name is required'); return; }
    try {
      const created = await createDeal(deal);
      setDealId(created._id);
      setStep(1);
    } catch (e) {
      toast.error('Failed to create deal');
    }
  };

  const handleStep2 = async () => {
    if (files.length === 0) { toast.error('Upload at least one file'); return; }
    setUploading(true);
    try {
      const result = await uploadFiles(files, dealId, setUploadPct);
      setSavedNames(result.savedNames || []);
      if (result.errors?.length) toast.error(`${result.errors.length} file(s) failed`);
      toast.success(`${result.count} file(s) uploaded`);
      setStep(2);
    } catch (e) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const job = await startJob(dealId, savedNames, deal.modelProfile);
      toast.success('Analysis launched!');
      navigate(`/deals/${dealId}?jobId=${job.jobId}&pythonJobId=${job.pythonJobId}`);
    } catch (e) {
      toast.error('Failed to start: ' + e.message);
      setLaunching(false);
    }
  };

  const MODEL_PROFILES = [
    { value: 'economy', label: 'Economy', desc: 'GPT-4o-mini for all agents (fastest, lowest cost)' },
    { value: 'standard', label: 'Standard', desc: 'GPT-4o-mini + GPT-4o synthesis (recommended)' },
    { value: 'premium', label: 'Premium', desc: 'GPT-4o for all agents (highest quality)' },
  ];

  return (
    <div className="nd">
      <div className="nd__container">
        <div className="nd__header">
          <h1 className="nd__title">New Due Diligence</h1>
          <p className="nd__sub">Set up your deal and upload the data room documents</p>
        </div>

        <StepIndicator current={step} />

        <div className="nd__card">
          {/* Step 0 — Deal Info */}
          {step === 0 && (
            <div className="nd__form">
              <h2 className="nd__form-title">Deal Information</h2>
              <div className="nd__field">
                <label className="nd__label">Deal Name *</label>
                <input className="nd__input" placeholder="e.g. Project Phoenix" value={deal.name}
                  onChange={(e) => setDeal((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="nd__row">
                <div className="nd__field">
                  <label className="nd__label">Target Company</label>
                  <input className="nd__input" placeholder="Acme Corp" value={deal.targetCompany}
                    onChange={(e) => setDeal((d) => ({ ...d, targetCompany: e.target.value }))} />
                </div>
                <div className="nd__field">
                  <label className="nd__label">Acquirer</label>
                  <input className="nd__input" placeholder="BigCo Inc" value={deal.acquirer}
                    onChange={(e) => setDeal((d) => ({ ...d, acquirer: e.target.value }))} />
                </div>
              </div>
              <div className="nd__field">
                <label className="nd__label">AI Model Profile</label>
                <div className="nd__profiles">
                  {MODEL_PROFILES.map((p) => (
                    <div
                      key={p.value}
                      className={`nd__profile ${deal.modelProfile === p.value ? 'nd__profile--active' : ''}`}
                      onClick={() => setDeal((d) => ({ ...d, modelProfile: p.value }))}
                    >
                      <div className="nd__profile-label">{p.label}</div>
                      <div className="nd__profile-desc">{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button className="nd__btn nd__btn--primary" onClick={handleStep1}>
                Continue →
              </button>
            </div>
          )}

          {/* Step 1 — Upload */}
          {step === 1 && (
            <div className="nd__form">
              <h2 className="nd__form-title">Upload Data Room Documents</h2>
              <div {...getRootProps()} className={`nd__dropzone ${isDragActive ? 'nd__dropzone--active' : ''}`}>
                <input {...getInputProps()} />
                <div className="nd__dropzone-icon">📁</div>
                <div className="nd__dropzone-text">
                  {isDragActive ? 'Drop files here…' : 'Drag & drop files, or click to select'}
                </div>
                <div className="nd__dropzone-hint">
                  Supported: PDF, DOCX, XLSX, PPTX, TXT, CSV · Max 50MB each
                </div>
              </div>

              {files.length > 0 && (
                <div className="nd__filelist">
                  {files.map((f, i) => (
                    <div key={i} className="nd__file">
                      <span className="nd__file-icon">📄</span>
                      <span className="nd__file-name">{f.name}</span>
                      <span className="nd__file-size">{(f.size / 1024 / 1024).toFixed(2)}MB</span>
                      <button className="nd__file-remove" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {uploading && (
                <div className="nd__upload-progress">
                  <div className="nd__upload-bar" style={{ width: `${uploadPct}%` }} />
                  <span>{uploadPct}% uploaded</span>
                </div>
              )}

              <div className="nd__actions">
                <button className="nd__btn nd__btn--ghost" onClick={() => setStep(0)}>← Back</button>
                <button className="nd__btn nd__btn--primary" onClick={handleStep2} disabled={uploading}>
                  {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''} →`}
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Launch */}
          {step === 2 && (
            <div className="nd__form nd__form--launch">
              <div className="nd__launch-icon">🚀</div>
              <h2 className="nd__form-title">Ready to Launch</h2>
              <div className="nd__summary">
                <div className="nd__summary-row"><span>Deal</span><strong>{deal.name}</strong></div>
                {deal.targetCompany && <div className="nd__summary-row"><span>Target</span><strong>{deal.targetCompany}</strong></div>}
                <div className="nd__summary-row"><span>Files</span><strong>{savedNames.length} document{savedNames.length !== 1 ? 's' : ''}</strong></div>
                <div className="nd__summary-row"><span>Model</span><strong>{deal.modelProfile.charAt(0).toUpperCase() + deal.modelProfile.slice(1)}</strong></div>
              </div>
              <p className="nd__launch-desc">
                13 AI agents will now analyze your data room in parallel across 9 domains.
                You can watch their progress in real-time on the next screen.
              </p>
              <div className="nd__actions">
                <button className="nd__btn nd__btn--ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="nd__btn nd__btn--primary nd__btn--lg" onClick={handleLaunch} disabled={launching}>
                  {launching ? '🤖 Launching…' : '🚀 Launch Analysis'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
