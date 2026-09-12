import { passwordStrength } from '@/features/auth/components/PasswordStrength'

/**
 * The sign-up strength meter's rule (STOURIFY-286). It is advice, never a gate:
 * the server's own password rules decide whether an account is created. What
 * these pin is that the advice is honest — a long run of one letter is not
 * "Strong", which is what the design prototype's length-only rule would say.
 */
describe('passwordStrength', () => {
  it('says what to aim for before anything is typed', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: 'Use 8+ characters' })
  })

  it('calls anything under eight characters weak, however varied', () => {
    expect(passwordStrength('abc').label).toBe('Strength: Weak')
    expect(passwordStrength('aB3!xyz').score).toBe(1)
  })

  it('calls eight letters of one kind weak — length alone is not strength', () => {
    expect(passwordStrength('password').label).toBe('Strength: Weak')
    expect(passwordStrength('aaaaaaaaa').label).toBe('Strength: Weak')
  })

  it('calls a second kind of character good', () => {
    expect(passwordStrength('password1')).toEqual({ score: 2, label: 'Strength: Good' })
  })

  it('calls a real mix strong', () => {
    expect(passwordStrength('Password1!')).toEqual({ score: 3, label: 'Strength: Strong' })
  })

  it('counts twelve or more characters as a point of its own', () => {
    expect(passwordStrength('correcthorsebattery').label).toBe('Strength: Good')
    expect(passwordStrength('correcthorsebattery9').label).toBe('Strength: Strong')
  })
})
