import CtaButton from '../common/CtaButton'

function Navbar({
  brand,
  links,
  ctaLabel,
  ctaHref,
  onCtaClick,
  onProfileClick,
  trailing,
}) {
  return (
    <header className="navbar">
      <a className="navbar__brand" href="/">
        {brand}
      </a>

      <nav className="navbar__links" aria-label="Main navigation">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="navbar__actions">
        {trailing}
        {ctaLabel ? <CtaButton label={ctaLabel} href={ctaHref} onClick={onCtaClick} /> : null}
        <button
          type="button"
          className="navbar__profile"
          aria-label="Profile"
          onClick={onProfileClick}
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path d="M12 12.75a4.75 4.75 0 1 0-4.75-4.75A4.75 4.75 0 0 0 12 12.75Zm0 1.5c-4.01 0-7.25 2.34-7.25 5.25a.75.75 0 0 0 .75.75h13a.75.75 0 0 0 .75-.75c0-2.91-3.24-5.25-7.25-5.25Z" />
          </svg>
        </button>
      </div>
    </header>
  )
}

export default Navbar
