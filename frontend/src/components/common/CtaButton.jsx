function CtaButton({
  label,
  href,
  type = 'button',
  variant = 'primary',
  onClick,
}) {
  const className = `cta-button cta-button--${variant}`

  if (href) {
    return (
      <a className={className} href={href} onClick={onClick}>
        {label}
      </a>
    )
  }

  return (
    <button className={className} type={type} onClick={onClick}>
      {label}
    </button>
  )
}

export default CtaButton
