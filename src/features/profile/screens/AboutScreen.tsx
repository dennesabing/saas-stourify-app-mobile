import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import { BarHeader, Icon, Text } from '@/shared/components/ui'
import { INSTALLED_VERSION_LINE } from '@/shared/config/installedBuild'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'About'>

/** The design's `.about .logo`: an 80-point tile with 24-point corners. */
const MARK = 80

/**
 * About — artboard 8 of `docs/design/Stourify - Settings.dc.html`
 * (STOURIFY-291).
 *
 * The back page of a paperback: which edition this is, who made it, and one
 * line on why. It reads nothing from the server, so it opens offline.
 *
 * Three things the canvas draws are left out, because nothing backs them yet
 * and a button that opens nothing is a promise the app breaks (STOURIFY-75):
 * "Rate Stourify" (no public store listing — STOURIFY-79), the social links (no
 * accounts on record), and "Photography via Unsplash contributors" (the app
 * ships no Unsplash photos; that credit belongs to the design canvases). The
 * canvas's "Stourify Inc." is also dropped: no such company is on record, and a
 * legal-sounding claim is not something to invent. See
 * `docs/what-about-and-report-leave-out.md`.
 */
export default function AboutScreen({ navigation }: Props) {
  const theme = useTheme()
  const year = new Date().getFullYear()

  return (
    <View testID="about-screen" style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <BarHeader title="About" onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 30 }}>
            {/* The brand mark: the pin on the brand gradient, 135° from the
                azure to the teal, exactly as `.about .logo` draws it.
                Decorative — the wordmark below says the same thing in words. */}
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: MARK,
                height: MARK,
                borderRadius: 24,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Svg width={MARK} height={MARK} style={{ position: 'absolute' }}>
                <Defs>
                  <LinearGradient id="aboutMark" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={theme.colors.primary} />
                    <Stop offset="1" stopColor={theme.colors.accent2} />
                  </LinearGradient>
                </Defs>
                <Rect width={MARK} height={MARK} fill="url(#aboutMark)" />
              </Svg>
              <Icon name="pin" size={40} color="onButton" strokeWidth={2} />
            </View>

            <Text
              variant="display"
              style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 28, lineHeight: 34 }}
            >
              Stourify
            </Text>

            <Text
              testID="about-version"
              variant="caption"
              color="muted"
              style={{
                fontFamily: theme.fontFamily.bodyMedium,
                fontSize: 12.5,
                marginTop: 4,
              }}
            >
              {INSTALLED_VERSION_LINE}
            </Text>

            <Text
              variant="body"
              style={{
                fontSize: 14,
                lineHeight: 22,
                textAlign: 'center',
                marginTop: 16,
                opacity: 0.82,
              }}
            >
              Helping curious travelers and locals discover the hidden gems of their city — one
              spot, trail, and story at a time.
            </Text>
          </View>

          <View style={{ alignItems: 'center', paddingTop: 28, paddingHorizontal: 20 }}>
            <Text
              variant="caption"
              color="muted"
              style={{ fontSize: 11.5, lineHeight: 19.5, textAlign: 'center' }}
            >
              Made with care in General Santos City.
            </Text>
            <Text
              variant="caption"
              color="muted"
              style={{ fontSize: 11.5, lineHeight: 19.5, textAlign: 'center' }}
            >
              © {year} Stourify · All rights reserved.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}
