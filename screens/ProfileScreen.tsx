import React from "react";
import { StyleSheet, View, TextInput, Pressable, Alert, Platform, Image } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { Icon } from "@/components/Icon";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import { useAppContext } from "@/context/AppContext";

const InspiredLogo = require("@/assets/images/inspired-logo.png");

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

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, "Profile">;
};

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const {
    userName,
    setUserName,
    recordingQuality,
    setRecordingQuality,
    autoSave,
    setAutoSave,
    isAdmin,
    setIsAdmin,
    readingLevel,
    resetOnboarding,
    privacyConsent,
    privacyConsentDate,
    visits,
    clearAllData,
  } = useAppContext();

  // clear stored encounters, chat history, and checklists
  const handleClearData = () => {
    const confirmClear = () => {
      clearAllData();
      if (Platform.OS === "web") {
        window.alert("Your data has been cleared.");
      } else {
        Alert.alert(
          "Data Cleared",
          "All your visit recordings, chat history, and planner questions have been removed."
        );
      }
    };

    if (Platform.OS === "web") {
      if (
        window.confirm(
          "Are you sure you want to delete all your data? This includes all visit recordings, chat history, and planner questions. This action cannot be undone."
        )
      ) {
        confirmClear();
      }
    } else {
      Alert.alert(
        "Clear All Data",
        "Are you sure you want to delete all your data? This includes all visit recordings, chat history, and planner questions. This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete Everything", style: "destructive", onPress: confirmClear },
        ]
      );
    }
  };

  // map reading level score to display label
  const getStyleLabel = (level: number): string => {
    if (level <= 6) return "Essential";
    if (level <= 8) return "Balanced";
    if (level <= 10) return "Detailed";
    return "Comprehensive";
  };

  return (
    <>
      {/* portal title banner */}
      <View style={styles.topHeaderBar}>
        <ThemedText style={styles.topHeaderTitle}>Account & Care Settings</ThemedText>
      </View>

      <ScreenKeyboardAwareScrollView>
        <View style={styles.container}>
          <ThemedText style={styles.sectionHeading}>User Profile</ThemedText>

          {/* caregiver identity input */}
          <View style={styles.inputCard}>
            <ThemedText style={styles.inputLabel}>Caregiver Name</ThemedText>
            <TextInput
              style={styles.nameInput}
              value={userName}
              onChangeText={setUserName}
              placeholder="Your name"
              placeholderTextColor="#7C96A0"
            />
          </View>

          {/* audio capture preferences */}
          <SettingSection title="Recording Quality">
            <SettingToggle
              label="Capture High-Fidelity Audio"
              value={recordingQuality === "high"}
              onValueChange={(value) => setRecordingQuality(value ? "high" : "medium")}
            />
          </SettingSection>

          {/* automatic summary save toggle */}
          <SettingSection title="Session Persistence">
            <SettingToggle
              label="Automatically archive summaries"
              value={autoSave}
              onValueChange={setAutoSave}
            />
          </SettingSection>

          {/* local storage disclosure and reset actions */}
          <SettingSection title="Privacy & Local Storage">
            <View style={styles.privacyCard}>
              <View style={styles.privacyItem}>
                <Icon name="home" size={18} color={EDITORIAL_THEME.accentTeal} />
                <View style={styles.privacyItemText}>
                  <ThemedText style={styles.privacyItemTitle}>Local-First Storage</ThemedText>
                  <ThemedText style={styles.privacyItemDescription}>
                    Clinical encounters and checklists reside locally on your device.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.privacyItem}>
                <Icon name="sparkles" size={18} color={EDITORIAL_THEME.accentTeal} />
                <View style={styles.privacyItemText}>
                  <ThemedText style={styles.privacyItemTitle}>Encrypted AI Summaries</ThemedText>
                  <ThemedText style={styles.privacyItemDescription}>
                    Voice recordings are securely processed for medical transcription.
                  </ThemedText>
                </View>
              </View>

              {privacyConsent && privacyConsentDate ? (
                <View style={styles.privacyItem}>
                  <Icon name="checkmark-circle" size={18} color={EDITORIAL_THEME.accentTeal} />
                  <View style={styles.privacyItemText}>
                    <ThemedText style={styles.privacyItemTitle}>Privacy Acknowledged</ThemedText>
                    <ThemedText style={styles.privacyItemDescription}>
                      Verified on {privacyConsentDate.toLocaleDateString()}
                    </ThemedText>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.dataStats}>
              <ThemedText style={styles.dataStatsText}>
                {visits.length} clinical encounter{visits.length !== 1 ? "s" : ""} recorded
              </ThemedText>
            </View>

            {/* erase all persistent device data */}
            <Pressable onPress={handleClearData} style={styles.deleteButton}>
              <Icon name="trash" size={16} color="#C93B2B" />
              <ThemedText style={styles.deleteButtonText}>
                Erase Device Records
              </ThemedText>
            </Pressable>
          </SettingSection>

          {/* reading level re-evaluation entry point */}
          <SettingSection title="Clinical Communication Style">
            <View style={styles.readingLevelRow}>
              <View>
                <ThemedText style={styles.fieldTitle}>Explanation Depth</ThemedText>
                <ThemedText style={styles.readingLevelValue}>
                  {getStyleLabel(readingLevel)}
                </ThemedText>
              </View>
              <Pressable onPress={resetOnboarding} style={styles.redoButton}>
                <Icon name="refresh" size={14} color={EDITORIAL_THEME.accentTeal} />
                <ThemedText style={styles.redoButtonText}>
                  Reconfigure
                </ThemedText>
              </Pressable>
            </View>
          </SettingSection>

          {/* administrative controls for medical source repositories */}
          {isAdmin && (
            <Pressable
              onPress={() => navigation.navigate("AdminSources")}
              style={styles.adminActionCard}
            >
              <Icon name="document" size={18} color={EDITORIAL_THEME.accentTeal} />
              <ThemedText style={styles.adminActionCardText}>
                Manage Trusted Clinical References
              </ThemedText>
            </Pressable>
          )}

          {/* toggle developer and administrative mode */}
          <View style={styles.adminToggle}>
            <Pressable
              onPress={() => setIsAdmin(!isAdmin)}
              style={[
                styles.adminButton,
                isAdmin && { backgroundColor: EDITORIAL_THEME.accentTeal },
              ]}
            >
              <Icon
                name="shield"
                size={14}
                color={isAdmin ? "#FFFFFF" : "#7C96A0"}
              />
              <ThemedText
                style={{
                  color: isAdmin ? "#FFFFFF" : "#5C7680",
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isAdmin ? "Admin Controls Enabled" : "Enable Clinical Admin"}
              </ThemedText>
            </Pressable>
          </View>

          {/* application version and mission display */}
          <View style={styles.aboutSection}>
            <Image
              source={InspiredLogo}
              style={styles.aboutLogo}
              resizeMode="contain"
            />
            <ThemedText style={styles.version}>Version 1.0.0</ThemedText>
            <ThemedText style={styles.copyright}>
              Supporting pediatric respiratory care workflows
            </ThemedText>
          </View>
        </View>
      </ScreenKeyboardAwareScrollView>
    </>
  );
}

// container component for grouped settings
function SettingSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingSection}>
      <ThemedText style={styles.settingTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

// custom toggle switch for boolean preferences
function SettingToggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={styles.toggleRow}
    >
      <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
      <View
        style={[
          styles.toggle,
          {
            backgroundColor: value
              ? EDITORIAL_THEME.accentTeal
              : "#E5EDF0",
            borderColor: EDITORIAL_THEME.borderColor,
          },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            {
              transform: [{ translateX: value ? 18 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
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
    gap: Spacing.lg,
    backgroundColor: "#F7FAFB",
  },
  sectionHeading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 22,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
  },
  inputCard: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: EDITORIAL_THEME.accentTeal,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  nameInput: {
    fontSize: 16,
    fontWeight: "600",
    color: EDITORIAL_THEME.textDark,
  },
  settingSection: {
    gap: Spacing.xs,
  },
  settingTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 15,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  toggleLabel: {
    fontSize: 14,
    color: EDITORIAL_THEME.textDark,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    padding: 2,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  privacyCard: {
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  privacyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  privacyItemText: {
    flex: 1,
  },
  privacyItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: EDITORIAL_THEME.textDark,
  },
  privacyItemDescription: {
    fontSize: 12,
    color: "#5C7680",
    marginTop: 2,
    lineHeight: 16,
  },
  dataStats: {
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  dataStatsText: {
    fontSize: 12,
    color: "#7C96A0",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: 12,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: "#F0C7C4",
    backgroundColor: "#FDF4F4",
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C93B2B",
  },
  readingLevelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.borderColor,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
  },
  fieldTitle: {
    fontSize: 13,
    color: "#5C7680",
  },
  readingLevelValue: {
    fontSize: 15,
    fontWeight: "700",
    color: EDITORIAL_THEME.textDark,
    marginTop: 2,
  },
  redoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    backgroundColor: EDITORIAL_THEME.bannerBg,
  },
  redoButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: EDITORIAL_THEME.accentTeal,
  },
  adminActionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: EDITORIAL_THEME.cardBg,
    borderColor: EDITORIAL_THEME.accentTeal,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.xs,
  },
  adminActionCardText: {
    fontSize: 13,
    fontWeight: "600",
    color: EDITORIAL_THEME.accentTeal,
  },
  adminToggle: {
    alignItems: "center",
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: EDITORIAL_THEME.borderColor,
    backgroundColor: EDITORIAL_THEME.cardBg,
  },
  aboutSection: {
    alignItems: "center",
    gap: 2,
    marginTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  aboutLogo: {
    width: 140,
    height: 60,
    marginBottom: Spacing.xs,
  },
  version: {
    fontSize: 12,
    color: "#7C96A0",
  },
  copyright: {
    fontSize: 12,
    textAlign: "center",
    color: "#7C96A0",
  },
});