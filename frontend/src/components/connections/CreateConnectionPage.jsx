import { useMemo, useState } from 'react'

import elasticIpImg from '../../../demo-images/elastic-ip-img.png'

function isValidPublicIpv4(ip) {
  const trimmed = ip.trim()
  const match = trimmed.match(/^(\d{1,3}\.){3}\d{1,3}$/)
  if (!match) return false

  const parts = trimmed.split('.').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false

  const [a, b] = parts
  if (a === 10) return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 127) return false
  if (a === 0) return false

  return true
}

function CreateConnectionPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [elasticIp, setElasticIp] = useState('')
  const [username, setUsername] = useState('')
  const [showElasticIpImage, setShowElasticIpImage] = useState(false)
  const [copied, setCopied] = useState(false)
  const hasValidElasticIp = useMemo(() => isValidPublicIpv4(elasticIp), [elasticIp])
  const isStepOneComplete = useMemo(
    () => elasticIp.trim().length > 0 && username.trim().length > 0,
    [elasticIp, username],
  )
  const publicKey =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOQfGqkJ6vUj1M2c8Y4nQ2Pp4t6L8s1d3h5j7k9m1n2g genos@sentinel'

  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(publicKey)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="create-connection-main">
      <section className="create-connection-card">
        {currentStep === 1 ? (
          <>
            <p className="create-connection-step-count">Step 1 of 3</p>
            <h1>Assign Elastic IP in AWS</h1>
            <p className="create-connection-subtext">
              First, allocate an Elastic IP in AWS and attach it to the EC2 instance you
              want GenOS to connect to.
            </p>

            <ol className="create-connection-instructions">
              <li>Open AWS Console and go to EC2.</li>
              <li>
                <div className="create-connection-instruction-row">
                  <span>From the left sidebar, open Elastic IPs.</span>
                  <button
                    type="button"
                    className="create-connection-image-toggle"
                    onClick={() => setShowElasticIpImage((prev) => !prev)}
                    aria-expanded={showElasticIpImage}
                    aria-controls="elastic-ip-demo-image"
                  >
                    {showElasticIpImage ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showElasticIpImage ? (
                  <img
                    id="elastic-ip-demo-image"
                    src={elasticIpImg}
                    alt="AWS EC2 sidebar highlighting Elastic IPs option"
                    className="create-connection-demo-image"
                  />
                ) : null}
              </li>
              <li>Click Allocate Elastic IP address and then click Allocate.</li>
              <li>Choose the new IP and then click on Actions. Choose Associate Elastic IP Address.</li>
              <li>
                Choose your EC2 instance to be connected to GenOS, and choose the Private IP
                given in the dropdown, then click Associate.
              </li>
              <li>Once Associated, provide that Elastic IP.</li>
            </ol>

            <label htmlFor="elastic-ip-input">Elastic IP</label>
            <input
              id="elastic-ip-input"
              value={elasticIp}
              onChange={(event) => setElasticIp(event.target.value)}
              placeholder="e.g. 3.110.25.19"
              className="create-connection-input"
            />

            <p className="create-connection-step7">
              7. In your instance run the command <code>whoami</code> and also provide the user
              name.
            </p>

            <label htmlFor="username-input">Username</label>
            <input
              id="username-input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. ubuntu"
              className="create-connection-input"
            />

            <p
              className={`create-connection-validation ${
                isStepOneComplete ? 'valid' : 'invalid'
              }`}
            >
              {hasValidElasticIp
                ? isStepOneComplete
                  ? ''
                  : 'Enter the username to continue.'
                : 'Enter a valid public IPv4 Elastic IP to continue.'}
            </p>

            <div className="create-connection-actions">
              <button
                type="button"
                className="create-connection-next"
                disabled={!isStepOneComplete}
                onClick={() => setCurrentStep(2)}
              >
                Next
              </button>
            </div>
          </>
        ) : currentStep === 2 ? (
          <>
            <p className="create-connection-step-count">Step 2 of 3</p>
            <h1>Add GenOS Public SSH Key</h1>
            <p className="create-connection-subtext">
              Copy this public key and paste it into the <code>authorized_keys</code> file
              inside your instance&apos;s hidden <code>.ssh</code> folder.
            </p>
            <ol className="create-connection-instructions">
              <li>
                Run: <code>cd .ssh</code> to enter your SSH file.
              </li>
              <li>
                Run: <code>nano authorized_keys</code> to create the file.
              </li>
            </ol>
            <div className="create-connection-key-section">
              <label htmlFor="genos-public-key">GenOS Public SSH Key</label>
              <textarea
                id="genos-public-key"
                className="create-connection-key"
                readOnly
                value={publicKey}
              />
              <button
                type="button"
                className="create-connection-next create-connection-key-copy"
                onClick={handleCopyKey}
              >
                {copied ? 'Copied' : 'Copy Key'}
              </button>
            </div>
            <ol className="create-connection-instructions" start="3">
              <li>Paste the given Public Key into the authorized_keys file, save and exit.</li>
            </ol>
            <div className="create-connection-actions">
              <button
                type="button"
                className="create-connection-next"
                onClick={() => setCurrentStep(3)}
              >
                Next
              </button>
            </div>
          </>
        ) : currentStep === 3 ? (
          <>
            <p className="create-connection-step-count">Step 3 of 3</p>
            <h1>Setting up Permissions</h1>
            <ol className="create-connection-instructions">
              <li>Run: <code>chmod 700 ~/.ssh</code> to change folder permissions.</li>
              <li>Run: <code>chmod 600 ~/.ssh/authorized_keys</code> to change file permissions.</li>
            </ol>
            <div className="create-connection-actions">
              <button
                type="button"
                className="create-connection-next"
                onClick={() => setCurrentStep(4)}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="create-connection-step-count">Connecting</p>
            <h1>GenOS is connecting</h1>
            <p className="create-connection-subtext">
              Establishing a secure connection to your instance. This is a placeholder
              animation state for now.
            </p>
            <div className="create-connection-animation-placeholder" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default CreateConnectionPage
