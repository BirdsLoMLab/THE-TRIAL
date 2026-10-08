import { PLAYER_COLORS } from '../store/sameDevice'

export function ColorPicker({
  value,
  onChange,
  label,
  size = 'lg',
}: {
  readonly value: string
  readonly onChange: (hex: string) => void
  readonly label: string
  readonly size?: 'lg' | 'md'
}) {
  const dim = size === 'lg' ? 'h-11 w-11' : 'h-10 w-10'
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-2">
      {PLAYER_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          role="radio"
          aria-checked={value === color.hex}
          aria-label={color.name}
          onClick={() => onChange(color.hex)}
          className={`${dim} rounded-full border-4 transition ${value === color.hex ? 'border-ink scale-105' : 'border-transparent'}`}
          style={{ backgroundColor: color.hex }}
        />
      ))}
    </div>
  )
}
