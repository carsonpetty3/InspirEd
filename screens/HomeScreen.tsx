import React from "react";
import { View, StyleSheet, Image, Pressable, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScreenScrollView } from "@/components/ScreenScrollView";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useAppContext } from "@/context/AppContext";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// editorial styling design tokens
const EDITORIAL_THEME = {
  headerBg: "#094E5D",
  bannerBg: "#F0F7F9",
  cardBg: "#FFFFFF",
  borderColor: "#D4E5EA",
  textDark: "#1C363D",
  accentTeal: "#0B6476",
  accentAmber: "#E0A938",
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const { userName, visits } = useAppContext();
  const navigation = useNavigation<any>();

  // derive overview stats and recent visit details
  const lastVisit = visits[0];
  const totalVisits = visits.length;
  const totalQuestions = Object.values(useAppContext().chatMessages).reduce(
    (sum, messages) => sum + messages.filter((m) => m.isUser).length,
    0
  );

  // display rotating supportive prompt for caregivers
  const motivationalQuotes = [
    "Knowledge is power, and you're gaining strength every day.",
    "Every visit is a step forward on your journey.",
    "Your dedication makes a difference.",
    "Learning together, growing stronger together.",
  ];

  const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

  // navigate to visit audio recorder
  const handleRecordPress = () => {
    navigation.navigate("RecordVisit");
  };

  return (
    <>
      {/* portal title banner */}
      <View style={styles.topHeaderBar}>
        <ThemedText style={styles.topHeaderTitle}>InspirEd Medical Care Portal</ThemedText>
      </View>

      <ScreenScrollView>
        <View style={styles.container}>
          <ThemedText style={styles.sectionHeading}>Overview & Progress</ThemedText>

          {/* greeting card with caregiver message */}
          <View style={styles.calloutCard}>
            <ThemedText style={styles.greeting}>Hello, {userName}</ThemedText>
            <ThemedText style={styles.quote}>{quote}</ThemedText>
          </View>

          {/* conditionally render patient records or onboarding empty state */}
          {lastVisit ? (
            <>
              {/* navigate to details of most recent clinical encounter */}
              <ActionButton
                icon="document"
                title="Recent Visit Summary"
                subtitle={new Date(lastVisit.date).toLocaleDateString()}
                onPress={() =>
                  navigation.navigate("HistoryTab", {
                    screen: "VisitDetail",
                    params: { visitId: lastVisit.id },
                  })
                }
              />

              {/* display total visits and question metrics */}
              <View style={styles.statsContainer}>
                <StatCard
                  icon="time"
                  value={totalVisits.toString()}
                  label="Total Visits"
                  onPress={() =>
                    navigation.navigate("HistoryTab", { screen: "HistoryList" })
                  }
                />
                <StatCard
                  icon="help"
                  value={totalQuestions.toString()}
                  label="Questions Explored"
                  onPress={() => navigation.navigate("LearnTab")}
                />
              </View>

              {/* launch chat conversation scoped to previous visit */}
              <ActionButton
                icon="chat"
                title="Clinical Assistant"
                subtitle="Review doctor notes & ask questions"
                onPress={() => {
                  if (lastVisit) {
                    navigation.navigate("HistoryTab", {
                      screen: "Chat",
                      params: { visitId: lastVisit.id },
                    });
                  }
                }}
              />

              {/* open visit checklist and prep builder */}
              <ActionButton
                icon="calendar"
                title="Prepare Next Visit"
                subtitle="Pre-visit questions and symptom checklist"
                onPress={() => navigation.navigate("PlannerTab")}
              />
            </>
          ) : (
            // guide first-time users to record their first visit
            <EmptyState onPress={handleRecordPress} />
          )}
        </View>
      </ScreenScrollView>
    </>
  );
}

// render animated statistic tile
function StatCard({
  icon,
  value,
  label,
  onPress,
}: {
  icon: "time" | "help";
  value: string;
  label: string;
  onPress?: () => void;
}) {
  const scale = useSharedValue(1);

  // handle spring press animation
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[animatedStyle, styles.statCard]}
    >
      <Icon name={icon} size={22} color={EDITORIAL_THEME.accentTeal} />
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </AnimatedPressable>
  );
}

// render pressable navigation action row
function ActionButton({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: "document" | "chat" | "calendar";
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  // handle spring press animation
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={[animatedStyle, styles.actionButton]}
    >
      <Icon name={icon} size={22} color={EDITORIAL_THEME.accentTeal} />
      <View style={styles.actionTextContainer}>
        <ThemedText style={styles.actionTitle}>{title}</ThemedText>
        <ThemedText style={styles.actionSubtitle}>{subtitle}</ThemedText>
      </View>
      <Icon name="chevron-right" size={18} color="#7A939E" />
    </AnimatedPressable>
  );
}

// render placeholder state with single initial recording trigger
function EmptyState({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.mediaFrame}>
        <Image
          source={require("@/assets/illustrations/empty-first-visit.png")}
          style={styles.emptyImage}
          resizeMode="contain"
        />
        <ThemedText style={styles.overviewBadge}>▶ Getting Started</ThemedText>
        <ThemedText style={styles.emptyTitle}>Welcome to InspirEd</ThemedText>
        <ThemedText style={styles.emptyText}>
          Begin your journey by documenting clinical discussions and tracking diagnoses.
        </ThemedText>
      </View>

      {/* primary trigger to begin initial visit encounter */}
      <Pressable style={styles.primaryActionButton} onPress={onPress}>
        <ThemedText style={styles.primaryActionText}>
          Start: Record Doctor Visit →
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topHeaderBar: {
    backgroundColor: EDITORIAL_THEME.headerBg,
    paddingTop: Platform.OS === "ios" ? 54 : 16,
    paddingBottom: 16,
    paddingHorizontal: Spacing.lg,
  },
  topHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  container: {
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: "#F7FAFB",
  },
  sectionHeading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 22,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
    marginTop: Spacing.xs,
  },
  calloutCard: {
    backgroundColor: EDITORIAL_THEME.bannerBg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xs,
    borderLeftWidth: 4,
    borderLeftColor: EDITORIAL_THEME.accentTeal,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  greeting: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 18,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
    marginBottom: 4,
  },
  quote: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4A626A",
  },
  statsContainer: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
  },
  statLabel: {
    fontSize: 12,
    color: "#67828C",
    fontWeight: "500",
    textAlign: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    gap: Spacing.md,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: EDITORIAL_THEME.textDark,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: "#67828C",
  },
  emptyContainer: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  mediaFrame: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    borderRadius: BorderRadius.xs,
    padding: Spacing.lg,
    alignItems: "center",
  },
  overviewBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
    alignSelf: "flex-start",
    marginBottom: Spacing.sm,
  },
  emptyImage: {
    width: 140,
    height: 110,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 20,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: "#5C7680",
    paddingHorizontal: Spacing.md,
  },
  primaryActionButton: {
    backgroundColor: EDITORIAL_THEME.accentTeal,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
  },
  primaryActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});