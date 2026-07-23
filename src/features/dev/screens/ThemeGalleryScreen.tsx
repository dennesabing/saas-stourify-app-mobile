import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Rating,
  Skeleton,
  SpotCard,
  Tag,
  Text,
} from '@/shared/components/ui'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'
import { palette, radius, spacing, typography, type ColorScheme } from '@/theme/tokens'

/**
 * Renders every primitive in both palettes.
 *
 * This is the M0 exit criterion — "a theme gallery screen renders every
 * primitive on device". It is also the cheapest regression check the design
 * system gets: if a token drifts from the handoff, it shows up here first.
 */
export default function ThemeGalleryScreen() {
  const [scheme, setScheme] = useState<ColorScheme>('light')

  return (
    <ThemeProvider scheme={scheme}>
      <GalleryBody scheme={scheme} onToggle={setScheme} />
    </ThemeProvider>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme()

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <Text variant="h1">{title}</Text>
      {children}
      <Divider />
    </View>
  )
}

function GalleryBody({
  scheme,
  onToggle,
}: {
  scheme: ColorScheme
  onToggle: (scheme: ColorScheme) => void
}) {
  const theme = useTheme()
  const [selectedChip, setSelectedChip] = useState('Nature')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[6] }}>
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="display">Wander D4</Text>
          <Text variant="body" color="muted">
            Coastal Azure · every primitive, both palettes.
          </Text>
          <Button
            label={scheme === 'light' ? 'Switch to dark' : 'Switch to light'}
            variant="secondary"
            onPress={() => onToggle(scheme === 'light' ? 'dark' : 'light')}
          />
        </View>

        <Section title="Type scale">
          {(Object.keys(typography) as (keyof typeof typography)[]).map((variant) => (
            <Text key={variant} variant={variant}>
              {variant} — Sunset Ridge Overlook
            </Text>
          ))}
        </Section>

        <Section title="Colour">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
            {(Object.keys(palette[scheme]) as (keyof typeof theme.colors)[]).map((role) => (
              <View key={role} style={{ alignItems: 'center', gap: 4, width: 88 }}>
                <View
                  style={{
                    width: 56,
                    height: 40,
                    borderRadius: theme.radius.tag,
                    backgroundColor: theme.colors[role],
                    borderWidth: 1,
                    borderColor: theme.colors.hairline,
                  }}
                />
                <Text variant="micro" color="muted">
                  {role}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Buttons">
          <Button label="Primary — deep slate" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Accent — coral" variant="accent" />
          <Button label="Ghost" variant="ghost" />
          <Button label="Danger" variant="danger" />
          <Button label="Loading" loading />
          <Button label="Disabled" disabled />
          <Button label="Large, full width" size="lg" fullWidth />
        </Section>

        <Section title="Chips and tags">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
            {['All', 'Nature', 'Foodie', 'Coast'].map((label) => (
              <Chip
                key={label}
                label={label}
                selected={selectedChip === label}
                onPress={() => setSelectedChip(label)}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing[2] }}>
            <Tag label="Viewpoint" />
            <Tag label="Nature" />
            <Tag label="Heritage" />
          </View>
        </Section>

        <Section title="Avatars">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>
            <Avatar name="Alex Rivera" size={32} />
            <Avatar name="Maya Roams" size={40} />
            <Avatar name="Diego Lens" size={56} ringed />
            <Avatar name={null} size={40} />
          </View>
        </Section>

        <Section title="Rating">
          <Rating value={4.8} reviewCount={212} />
          <Rating value={4.8} compact />
        </Section>

        <Section title="Spot cards">
          <SpotCard
            title="Sunset Ridge Overlook"
            category="Viewpoint"
            rating={4.8}
            reviewCount={212}
            meta="Kadayawan Hills · 1.2 km away"
            isOpenNow
          />
          <SpotCard
            title="Brew & Bloom Café"
            category="Foodie"
            rating={4.8}
            meta="Downtown · 0.4 km"
            layout="wide"
          />
          <SpotCard title="Hidden Cove" category="Coast" meta="Created offline" isQueued />
        </Section>

        <Section title="Cards">
          <Card>
            <Text variant="h2">Raised card</Text>
            <Text variant="body" color="muted">
              Radius {radius.card}, elevation raised, {spacing[4]}px padding.
            </Text>
          </Card>
          <Card raised={false}>
            <Text variant="h2">Flat card</Text>
            <Text variant="body" color="muted">
              Hairline border instead of a shadow.
            </Text>
          </Card>
        </Section>

        <Section title="Skeletons">
          <Skeleton height={160} radius={radius.card} />
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </Section>

        <Section title="Empty state">
          <View style={{ height: 280 }}>
            <EmptyState
              icon="👣"
              title="Your feed is empty"
              subtitle="Follow explorers to see the spots they find."
              actionLabel="Find explorers"
              onAction={() => {}}
            />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}
