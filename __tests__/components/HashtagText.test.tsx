import { fireEvent, render, screen } from '@testing-library/react-native'
import HashtagText from '@/shared/components/ui/HashtagText'
import { ThemeProvider } from '@/theme/ThemeProvider'

function renderWithTheme(node: React.ReactElement) {
  return render(<ThemeProvider>{node}</ThemeProvider>)
}

describe('HashtagText', () => {
  it('renders a caption with no hashtag exactly as it was written', () => {
    renderWithTheme(<HashtagText text="great noodles" onPressHashtag={jest.fn()} />)

    expect(screen.getByText('great noodles')).toBeTruthy()
  })

  it('renders the hashtag as its own pressable piece, spelled as typed', () => {
    renderWithTheme(<HashtagText text="great #StreetFood here" onPressHashtag={jest.fn()} />)

    // The word keeps the author's capitalisation on screen; only the slug is
    // lowercased, and that is what travels to the API.
    expect(screen.getByText('#StreetFood')).toBeTruthy()
  })

  it('hands the lowercased slug to the handler when a hashtag is pressed', () => {
    const onPressHashtag = jest.fn()
    renderWithTheme(<HashtagText text="great #StreetFood here" onPressHashtag={onPressHashtag} />)

    fireEvent.press(screen.getByText('#StreetFood'))

    expect(onPressHashtag).toHaveBeenCalledWith('streetfood')
  })

  it('makes both halves of #food#drink pressable', () => {
    const onPressHashtag = jest.fn()
    renderWithTheme(<HashtagText text="#food#drink" onPressHashtag={onPressHashtag} />)

    fireEvent.press(screen.getByText('#drink'))

    expect(onPressHashtag).toHaveBeenCalledWith('drink')
  })

  it('leaves a hash glued to a word as ordinary text', () => {
    const onPressHashtag = jest.fn()
    renderWithTheme(<HashtagText text="I write C# daily" onPressHashtag={onPressHashtag} />)

    // Nothing to press: the whole sentence is one plain run.
    expect(screen.getByText('I write C# daily')).toBeTruthy()
    expect(onPressHashtag).not.toHaveBeenCalled()
  })

  it('renders nothing for empty text rather than an empty box', () => {
    const { toJSON } = renderWithTheme(<HashtagText text="" onPressHashtag={jest.fn()} />)

    expect(toJSON()).toBeNull()
  })

  it('tells a screen reader that a hashtag is a link', () => {
    renderWithTheme(<HashtagText text="great #streetfood" onPressHashtag={jest.fn()} />)

    expect(screen.getByLabelText('Hashtag streetfood')).toBeTruthy()
  })
})
