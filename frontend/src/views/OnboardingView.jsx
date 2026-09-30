import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

const SECTORS = ['Adult', 'Youth', 'Campus', 'YPF', 'Children', 'Other']

export function OnboardingView({
  isReplay = false,
  onReplayCancel,
  onReplayComplete,
  isDemoTest = false,
  onDemoTestCancel,
  onDemoTestComplete,
}) {
  const { account, saveOnboardingProgress, completeOnboarding, replayOnboardingFinish } = useAuth()

  // Form State
  const [sector, setSector] = useState('Adult')
  const [customSector, setCustomSector] = useState('')
  const [churchState, setChurchState] = useState('')
  const [stateBranch, setStateBranch] = useState('state_headquarters') // 'state_headquarters' | 'under_region'
  const [region, setRegion] = useState('')
  const [regionBranch, setRegionBranch] = useState('region_headquarters') // 'region_headquarters' | 'under_old_group'
  const [oldGroup, setOldGroup] = useState('')
  const [oldGroupBranch, setOldGroupBranch] = useState('old_group_headquarters') // 'old_group_headquarters' | 'under_group'
  const [groupName, setGroupName] = useState('')
  const [groupBranch, setGroupBranch] = useState('group_headquarters') // 'group_headquarters' | 'under_district'
  const [district, setDistrict] = useState('')

  // Workflow step state
  // Steps: 1: Sector, 2: Church State, 3: Region, 4: Old Group, 5: Group, 6: District, 7: Review
  const [step, setStep] = useState(1)
  const [history, setHistory] = useState([1])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState(null)

  // Initialize from existing account profile or local demo draft
  useEffect(() => {
    if (isDemoTest) {
      try {
        const rawDraft = localStorage.getItem('dlbc_demo_onboarding_draft')
        if (rawDraft) {
          const draft = JSON.parse(rawDraft)
          if (draft.sector) {
            if (SECTORS.includes(draft.sector)) {
              setSector(draft.sector)
            } else {
              setSector('Other')
              setCustomSector(draft.sector)
            }
          }
          if (draft.custom_sector) setCustomSector(draft.custom_sector)
          if (draft.church_state) setChurchState(draft.church_state)
          if (draft.region) setRegion(draft.region)
          if (draft.old_group) setOldGroup(draft.old_group)
          if (draft.group_name) setGroupName(draft.group_name)
          if (draft.district) setDistrict(draft.district)

          const term = draft.terminal_level || 'state_headquarters'
          if (term === 'state_headquarters') {
            setStateBranch('state_headquarters')
          } else {
            setStateBranch('under_region')
            if (term === 'region_headquarters') {
              setRegionBranch('region_headquarters')
            } else {
              setRegionBranch('under_old_group')
              if (term === 'old_group_headquarters') {
                setOldGroupBranch('old_group_headquarters')
              } else {
                setOldGroupBranch('under_group')
                if (term === 'group_headquarters') {
                  setGroupBranch('group_headquarters')
                } else {
                  setGroupBranch('under_district')
                }
              }
            }
          }
          if (draft.step && draft.step >= 1 && draft.step <= 7) {
            setStep(draft.step)
          }
          return
        }
      } catch (e) {
        console.warn('Error reading demo draft from localStorage:', e)
      }
    }

    if (account && !isDemoTest) {
      if (account.sector) {
        if (SECTORS.includes(account.sector)) {
          setSector(account.sector)
        } else {
          setSector('Other')
          setCustomSector(account.sector)
        }
      }
      if (account.custom_sector) setCustomSector(account.custom_sector)
      if (account.church_state) setChurchState(account.church_state)
      if (account.region) setRegion(account.region)
      if (account.old_group) setOldGroup(account.old_group)
      if (account.group_name) setGroupName(account.group_name)
      if (account.district) setDistrict(account.district)

      const term = account.terminal_level || 'state_headquarters'
      if (term === 'state_headquarters') {
        setStateBranch('state_headquarters')
      } else {
        setStateBranch('under_region')
        if (term === 'region_headquarters') {
          setRegionBranch('region_headquarters')
        } else {
          setRegionBranch('under_old_group')
          if (term === 'old_group_headquarters') {
            setOldGroupBranch('old_group_headquarters')
          } else {
            setOldGroupBranch('under_group')
            if (term === 'group_headquarters') {
              setGroupBranch('group_headquarters')
            } else {
              setGroupBranch('under_district')
            }
          }
        }
      }

      // If resuming first-time onboarding from server step
      if (!isReplay && account.onboarding_step && !account.onboarding_completed_at) {
        setStep(Math.max(1, account.onboarding_step))
      }
    }
  }, [account, isReplay, isDemoTest])

  // Derive terminal level based on current selections
  const getResolvedTerminalLevel = () => {
    if (stateBranch === 'state_headquarters') return 'state_headquarters'
    if (regionBranch === 'region_headquarters') return 'region_headquarters'
    if (oldGroupBranch === 'old_group_headquarters') return 'old_group_headquarters'
    if (groupBranch === 'group_headquarters') return 'group_headquarters'
    return 'district'
  }

  // Build clean payload with strict section 20 truncation (lower levels set to null)
  const buildPayload = () => {
    const term = getResolvedTerminalLevel()
    const cleanSector = sector === 'Other' ? (customSector.trim() || 'Other') : sector

    const payload = {
      sector: cleanSector,
      custom_sector: sector === 'Other' ? customSector.trim() : null,
      church_state: churchState.trim(),
      region: null,
      old_group: null,
      group_name: null,
      district: null,
      terminal_level: term,
    }

    if (term === 'region_headquarters') {
      payload.region = region.trim()
    } else if (term === 'old_group_headquarters') {
      payload.region = region.trim()
      payload.old_group = oldGroup.trim()
    } else if (term === 'group_headquarters') {
      payload.region = region.trim()
      payload.old_group = oldGroup.trim()
      payload.group_name = groupName.trim()
    } else if (term === 'district') {
      payload.region = region.trim()
      payload.old_group = oldGroup.trim()
      payload.group_name = groupName.trim()
      payload.district = district.trim()
    }

    return payload
  }

  // Derive human-readable display identity
  const getDerivedIdentity = () => {
    const secName = sector === 'Other' && customSector.trim() ? customSector.trim() : sector
    const term = getResolvedTerminalLevel()

    if (term === 'state_headquarters') {
      return `${secName} Information Unit – ${churchState.trim()} State Headquarters`
    }
    if (term === 'region_headquarters') {
      return `${secName} Information Unit – ${region.trim()} Region Headquarters`
    }
    if (term === 'old_group_headquarters') {
      return `${secName} Information Unit – ${oldGroup.trim()} Old Group Headquarters`
    }
    if (term === 'group_headquarters') {
      return `${secName} Information Unit – ${groupName.trim()} Group Headquarters`
    }
    return `${secName} Information Unit – ${district.trim() || 'Church'} District Church`
  }

  // Forward Navigation
  const handleContinue = async () => {
    setValidationError(null)

    // Step 1 Validation
    if (step === 1) {
      if (sector === 'Other' && !customSector.trim()) {
        setValidationError('Please enter your sector name.')
        return
      }
      navigateNext(2)
      return
    }

    // Step 2 Validation (Church State)
    if (step === 2) {
      if (!churchState.trim()) {
        setValidationError('Please enter your church state.')
        return
      }
      if (stateBranch === 'state_headquarters') {
        navigateNext(7) // Go directly to Review
      } else {
        navigateNext(3) // Go to Region
      }
      return
    }

    // Step 3 Validation (Region)
    if (step === 3) {
      if (!region.trim()) {
        setValidationError('Please enter your region name.')
        return
      }
      if (regionBranch === 'region_headquarters') {
        navigateNext(7) // Go directly to Review
      } else {
        navigateNext(4) // Go to Old Group
      }
      return
    }

    // Step 4 Validation (Old Group)
    if (step === 4) {
      if (!oldGroup.trim()) {
        setValidationError('Please enter your old group name.')
        return
      }
      if (oldGroupBranch === 'old_group_headquarters') {
        navigateNext(7) // Go directly to Review
      } else {
        navigateNext(5) // Go to Group
      }
      return
    }

    // Step 5 Validation (Group)
    if (step === 5) {
      if (!groupName.trim()) {
        setValidationError('Please enter your group name.')
        return
      }
      if (groupBranch === 'group_headquarters') {
        navigateNext(7) // Go directly to Review
      } else {
        navigateNext(6) // Go to District
      }
      return
    }

    // Step 6 Validation (District)
    if (step === 6) {
      if (!district.trim()) {
        setValidationError('Please enter your district name.')
        return
      }
      navigateNext(7) // Go to Review
      return
    }

    // Step 7: Final Completion
    if (step === 7) {
      setIsSubmitting(true)
      try {
        const payload = buildPayload()
        if (isDemoTest) {
          try {
            localStorage.setItem('dlbc_demo_onboarding_draft', JSON.stringify({ ...payload, step: 7, completed: true }))
          } catch (e) {
            console.warn('Error saving completed demo draft:', e)
          }
          if (onDemoTestComplete) {
            onDemoTestComplete()
          }
          return
        }
        if (isReplay) {
          await replayOnboardingFinish(payload)
          if (onReplayComplete) onReplayComplete()
        } else {
          await completeOnboarding(payload)
        }
      } catch (err) {
        setValidationError(err.message || 'Failed to complete setup. Please check your connection and try again.')
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const navigateNext = (nextStep) => {
    setHistory((prev) => [...prev, nextStep])
    setStep(nextStep)

    if (isDemoTest) {
      try {
        const payload = buildPayload()
        localStorage.setItem('dlbc_demo_onboarding_draft', JSON.stringify({ ...payload, step: nextStep }))
      } catch (e) {
        // Non-blocking localStorage save
      }
      return
    }

    // Save progress to backend if in initial onboarding mode
    if (!isReplay && nextStep < 7) {
      const payload = buildPayload()
      saveOnboardingProgress(payload, nextStep).catch(() => {
        // Non-blocking background save
      })
    }
  }

  // Back Navigation
  const handleBack = () => {
    setValidationError(null)
    if (history.length > 1) {
      const newHistory = [...history]
      newHistory.pop()
      const prevStep = newHistory[newHistory.length - 1]
      setHistory(newHistory)
      setStep(prevStep)
    }
  }

  // Calculate dynamic step index for the display badge (e.g. "Step 1", "Step 2", etc.)
  const currentStepNumber = history.length

  return (
    <div className="onboarding-page-container">
      <div className="onboarding-card">
        {/* Top Header */}
        <div className="onboarding-header">
          <div className="onboarding-brand">
            <div className="auth-logo-badge">DLBC</div>
            <div className="onboarding-brand-text">
              <span className="onboarding-brand-title">Information Unit</span>
              {isReplay && <span className="onboarding-replay-badge">Replay Mode</span>}
              {isDemoTest && <span className="onboarding-replay-badge" style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8' }}>Demo Test Mode</span>}
            </div>
          </div>
          <div className="onboarding-progress-badge">
            <span className="progress-step-pill">Step {currentStepNumber}</span>
            {isReplay && onReplayCancel && (
              <button
                type="button"
                className="onboarding-cancel-btn"
                onClick={onReplayCancel}
                title="Cancel replay and return to settings"
              >
                Exit Replay
              </button>
            )}
            {isDemoTest && onDemoTestCancel && (
              <button
                type="button"
                className="onboarding-cancel-btn"
                onClick={onDemoTestCancel}
                title="Exit demo test onboarding"
              >
                Exit Test
              </button>
            )}
          </div>
        </div>

        <div className="onboarding-divider" />

        {validationError && (
          <div className="onboarding-error-banner" role="alert">
            {validationError}
          </div>
        )}

        {/* Dynamic Step Content */}
        <div className="onboarding-content">
          {/* STEP 1: Sector */}
          {step === 1 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">
                Choose the sector of the Information Unit that this belongs to.
              </h2>
              <div className="sector-grid">
                {SECTORS.map((s) => {
                  const isSelected = sector === s
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`sector-tile ${isSelected ? 'sector-tile--selected' : ''}`}
                      onClick={() => setSector(s)}
                    >
                      <div className="sector-tile-radio">
                        {isSelected && <div className="sector-tile-radio-dot" />}
                      </div>
                      <span className="sector-tile-label">{s}</span>
                    </button>
                  )
                })}
              </div>

              {sector === 'Other' && (
                <div className="auth-field sector-custom-field">
                  <label htmlFor="input-custom-sector" className="auth-label">
                    Enter sector name
                  </label>
                  <input
                    id="input-custom-sector"
                    type="text"
                    className="auth-input"
                    value={customSector}
                    onChange={(e) => setCustomSector(e.target.value)}
                    placeholder="e.g. Language / Translation"
                    autoFocus
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Church State */}
          {step === 2 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">Enter your church state</h2>
              <div className="auth-field">
                <input
                  id="input-church-state"
                  type="text"
                  className="auth-input"
                  value={churchState}
                  onChange={(e) => setChurchState(e.target.value)}
                  placeholder="e.g. Rivers Central"
                  autoFocus
                  required
                />
              </div>

              <div className="onboarding-subquestion">
                <label className="onboarding-subquestion-label">Are you at the state headquarters?</label>
                <div className="hierarchy-choice-group">
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${stateBranch === 'state_headquarters' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setStateBranch('state_headquarters')}
                  >
                    State Headquarters
                  </button>
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${stateBranch === 'under_region' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setStateBranch('under_region')}
                  >
                    Under a Region
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Region */}
          {step === 3 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">Enter your region</h2>
              <div className="auth-field">
                <input
                  id="input-region"
                  type="text"
                  className="auth-input"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. Port Harcourt"
                  autoFocus
                  required
                />
              </div>

              <div className="onboarding-subquestion">
                <label className="onboarding-subquestion-label">Are you at the region headquarters?</label>
                <div className="hierarchy-choice-group">
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${regionBranch === 'region_headquarters' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setRegionBranch('region_headquarters')}
                  >
                    Region Headquarters
                  </button>
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${regionBranch === 'under_old_group' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setRegionBranch('under_old_group')}
                  >
                    Under an Old Group
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Old Group */}
          {step === 4 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">Enter your old group</h2>
              <div className="auth-field">
                <input
                  id="input-old-group"
                  type="text"
                  className="auth-input"
                  value={oldGroup}
                  onChange={(e) => setOldGroup(e.target.value)}
                  placeholder="e.g. Rumokoro"
                  autoFocus
                  required
                />
              </div>

              <div className="onboarding-subquestion">
                <label className="onboarding-subquestion-label">Are you at the old group headquarters?</label>
                <div className="hierarchy-choice-group">
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${oldGroupBranch === 'old_group_headquarters' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setOldGroupBranch('old_group_headquarters')}
                  >
                    Old Group Headquarters
                  </button>
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${oldGroupBranch === 'under_group' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setOldGroupBranch('under_group')}
                  >
                    Under a Group
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Group */}
          {step === 5 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">Enter your group</h2>
              <div className="auth-field">
                <input
                  id="input-group"
                  type="text"
                  className="auth-input"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Eliogbolo"
                  autoFocus
                  required
                />
              </div>

              <div className="onboarding-subquestion">
                <label className="onboarding-subquestion-label">Are you at the group headquarters?</label>
                <div className="hierarchy-choice-group">
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${groupBranch === 'group_headquarters' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setGroupBranch('group_headquarters')}
                  >
                    Group Headquarters
                  </button>
                  <button
                    type="button"
                    className={`hierarchy-choice-btn ${groupBranch === 'under_district' ? 'hierarchy-choice-btn--selected' : ''}`}
                    onClick={() => setGroupBranch('under_district')}
                  >
                    Under a District
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: District */}
          {step === 6 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">Enter your district</h2>
              <div className="auth-field">
                <input
                  id="input-district"
                  type="text"
                  className="auth-input"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="e.g. Mini Aza"
                  autoFocus
                  required
                />
              </div>
            </div>
          )}

          {/* STEP 7: Review */}
          {step === 7 && (
            <div className="onboarding-step-body">
              <h2 className="onboarding-heading">You're all set</h2>
              <div className="review-summary-card">
                <div className="review-sector-badge">
                  {sector === 'Other' && customSector.trim() ? customSector.trim() : sector} Information Unit
                </div>

                <div className="review-identity-preview">
                  <span className="review-identity-label">Account Identity</span>
                  <span className="review-identity-value">{getDerivedIdentity()}</span>
                </div>

                <div className="review-hierarchy-chain">
                  <div className="review-chain-item">
                    <span className="review-chain-label">State:</span>
                    <span className="review-chain-val">{churchState.trim()}</span>
                  </div>
                  {getResolvedTerminalLevel() !== 'state_headquarters' && region.trim() && (
                    <div className="review-chain-item">
                      <span className="review-chain-label">Region:</span>
                      <span className="review-chain-val">{region.trim()}</span>
                    </div>
                  )}
                  {['old_group_headquarters', 'group_headquarters', 'district'].includes(getResolvedTerminalLevel()) && oldGroup.trim() && (
                    <div className="review-chain-item">
                      <span className="review-chain-label">Old Group:</span>
                      <span className="review-chain-val">{oldGroup.trim()}</span>
                    </div>
                  )}
                  {['group_headquarters', 'district'].includes(getResolvedTerminalLevel()) && groupName.trim() && (
                    <div className="review-chain-item">
                      <span className="review-chain-label">Group:</span>
                      <span className="review-chain-val">{groupName.trim()}</span>
                    </div>
                  )}
                  {getResolvedTerminalLevel() === 'district' && district.trim() && (
                    <div className="review-chain-item">
                      <span className="review-chain-label">District:</span>
                      <span className="review-chain-val">{district.trim()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-divider" />

        {/* Footer Navigation Actions */}
        <div className="onboarding-footer">
          <div className="onboarding-footer-left">
            {step > 1 && (
              <button
                type="button"
                className="onboarding-back-btn"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                ← Back
              </button>
            )}
          </div>

          <div className="onboarding-footer-right">
            <button
              type="button"
              className="onboarding-continue-btn"
              onClick={handleContinue}
              disabled={isSubmitting}
              id="btn-onboarding-continue"
            >
              {isSubmitting
                ? 'Saving...'
                : step === 7
                ? (isDemoTest ? 'Finish preview →' : (isReplay ? 'Save changes →' : 'Finish setup →'))
                : 'Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
