import CtaButton from '../common/CtaButton'

function Navbar({ brand, links, ctaLabel, ctaHref, onCtaClick }) {
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

      <div className="navbar__cta">
        <CtaButton label={ctaLabel} href={ctaHref} onClick={onCtaClick} />
      </div>
    </header>
  )
}

export default Navbar
