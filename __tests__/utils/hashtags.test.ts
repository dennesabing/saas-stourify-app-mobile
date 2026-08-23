import { hashtagsIn, splitOnHashtags } from '@/shared/utils/hashtags'

/**
 * The rule table, mirroring `modules/Stourify/tests/Unit/HashtagParserTest.php`.
 *
 * Every rule here is a decision recorded on STOURIFY-103 — Hash Tagging
 * spots/posts, and the server is authoritative for all of them. This copy only
 * decides what the app underlines, so a disagreement is a word rendered plainly
 * for a moment rather than two different databases.
 *
 * The first two cases lead deliberately: they are the two a naive regular
 * expression gets wrong, and the PHP original's docblock says so.
 */
describe('finding hashtags in text', () => {
  it('reads two tags out of #food#drink', () => {
    // A lookbehind rejecting a `#` preceded by a word character kills the
    // second one, because the character before its `#` is the `d` of `food`.
    // People type this, so it has to work.
    expect(hashtagsIn('#food#drink')).toEqual(['food', 'drink'])
  })

  it('ignores a hash glued to the end of a word', () => {
    expect(hashtagsIn('I write C# for a living')).toEqual([])
    expect(hashtagsIn('turn left at route#5')).toEqual([])
  })

  it('finds nothing in text with no hashtag', () => {
    expect(hashtagsIn('great noodles')).toEqual([])
  })

  it('finds nothing in empty or missing text', () => {
    expect(hashtagsIn('')).toEqual([])
    expect(hashtagsIn(undefined)).toEqual([])
    expect(hashtagsIn(null)).toEqual([])
  })

  it('reads one hashtag out of a caption', () => {
    expect(hashtagsIn('great noodles #streetfood')).toEqual(['streetfood'])
  })

  it('reads several, in the order they were written', () => {
    expect(hashtagsIn('#a then #b then #c')).toEqual(['a', 'b', 'c'])
  })

  it('treats different capitalisations as one tag', () => {
    expect(hashtagsIn('#Food and #food and #FOOD')).toEqual(['food'])
  })

  it('stops a tag at the first character that is not a letter, digit or underscore', () => {
    expect(hashtagsIn('#food. #drink, #both!')).toEqual(['food', 'drink', 'both'])
    expect(hashtagsIn('#food-truck')).toEqual(['food'])
  })

  it('refuses an all-digit tag but allows one with a letter in it', () => {
    // Prices, room numbers and years stay ordinary text.
    expect(hashtagsIn('paid #2026 for it')).toEqual([])
    expect(hashtagsIn('#a1 and #_x')).toEqual(['a1', '_x'])
  })

  it('keeps letters that are not English, and does not fold accents', () => {
    // `#café` and `#cafe` are two tags on purpose: folding accents files a
    // French speaker's post under a word they did not write.
    expect(hashtagsIn('#café and #cafe and #東京')).toEqual(['café', 'cafe', '東京'])
  })

  it('stops at 64 characters and leaves the rest as ordinary text', () => {
    const long = 'a'.repeat(70)
    expect(hashtagsIn(`#${long}`)).toEqual(['a'.repeat(64)])
  })

  it('keeps at most thirty tags and ignores the rest rather than failing', () => {
    const many = Array.from({ length: 40 }, (_, n) => `#t${n}`).join(' ')
    expect(hashtagsIn(many)).toHaveLength(30)
  })

  it('reads a hashtag that starts the text and one that ends it', () => {
    expect(hashtagsIn('#first middle #last')).toEqual(['first', 'last'])
  })

  it('reads a hashtag after a newline', () => {
    expect(hashtagsIn('line one\n#second')).toEqual(['second'])
  })

  it('ignores a bare hash', () => {
    expect(hashtagsIn('just a # on its own')).toEqual([])
  })
})

/**
 * The renderer needs a different answer from the same rules: not the list of
 * tags, but the text cut into pieces so each piece can be styled.
 */
describe('splitting text for rendering', () => {
  it('returns the whole text as one plain piece when there is no hashtag', () => {
    expect(splitOnHashtags('great noodles')).toEqual([{ kind: 'text', text: 'great noodles' }])
  })

  it('cuts the text around a hashtag, keeping the words either side', () => {
    expect(splitOnHashtags('great #streetfood here')).toEqual([
      { kind: 'text', text: 'great ' },
      { kind: 'hashtag', text: '#streetfood', slug: 'streetfood' },
      { kind: 'text', text: ' here' },
    ])
  })

  it('gives a hashtag its slug, lowercased, while showing the spelling as written', () => {
    // `#StreetFood` is displayed as typed and tapped as `streetfood`, which is
    // what the API matches on.
    expect(splitOnHashtags('#StreetFood')).toEqual([
      { kind: 'hashtag', text: '#StreetFood', slug: 'streetfood' },
    ])
  })

  it('cuts #food#drink into two hashtag pieces with nothing between them', () => {
    expect(splitOnHashtags('#food#drink')).toEqual([
      { kind: 'hashtag', text: '#food', slug: 'food' },
      { kind: 'hashtag', text: '#drink', slug: 'drink' },
    ])
  })

  it('leaves a hash glued to a word inside the plain text', () => {
    expect(splitOnHashtags('I write C# daily')).toEqual([
      { kind: 'text', text: 'I write C# daily' },
    ])
  })

  it('emits every occurrence, even when two are the same tag', () => {
    // Unlike `hashtagsIn`, the renderer cannot collapse repeats — both words
    // are on screen and both have to be tappable.
    expect(splitOnHashtags('#food then #food')).toEqual([
      { kind: 'hashtag', text: '#food', slug: 'food' },
      { kind: 'text', text: ' then ' },
      { kind: 'hashtag', text: '#food', slug: 'food' },
    ])
  })

  it('returns nothing at all for empty or missing text', () => {
    expect(splitOnHashtags('')).toEqual([])
    expect(splitOnHashtags(undefined)).toEqual([])
  })
})
