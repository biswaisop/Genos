import './StarBorder.css'

function StarBorder({
  as: Component = 'div',
  className = '',
  color = 'rgba(192, 132, 252, 0.9)',
  speed = '6s',
  thickness = 1,
  children,
  ...rest
}) {
  return (
    <div className={`star-border-container ${className}`.trim()}>
      <div
        className="border-gradient-bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 65%)`,
          animationDuration: speed,
          height: `${Math.max(thickness * 24, 24)}px`,
        }}
      />
      <div
        className="border-gradient-top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 65%)`,
          animationDuration: speed,
          height: `${Math.max(thickness * 24, 24)}px`,
        }}
      />
      <Component className="inner-content" {...rest}>
        {children}
      </Component>
    </div>
  )
}

export default StarBorder
