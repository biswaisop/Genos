function Section({ id, eyebrow, title, description, className = '', children }) {
  return (
    <section id={id} className={`section ${className}`.trim()}>
      {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p className="section__description">{description}</p> : null}
      {children}
    </section>
  )
}

export default Section
