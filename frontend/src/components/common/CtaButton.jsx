function CtaButton({ label, href, type = 'button', variant = 'primary' }) {
  const className = `cta-button cta-button--${variant}`

  if (href) {
    return (
      <a className={className} href={href}>
        {label}
      </a>
    )
  }

  return (
    <button className={className} type={type}>
      {label}
    </button>
  )
}

export default CtaButton
