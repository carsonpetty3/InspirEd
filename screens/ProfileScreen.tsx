import React from "react";
import { StyleSheet, View, TextInput, Pressable, Alert, Platform, Image } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenKeyboardAwareScrollView } from "@/components/ScreenKeyboardAwareScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import { useAppContext } from "@/context/AppContext";
import { Icon } from "@/components/Icon";

const InspiredLogo = require("@/assets/images/inspired-logo.png");

type ProfileScreenProps = {
  navigation: NativeStackNavigationProp<ProfileStackParamList, "Profile">;
};

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const { theme } = useTheme();
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
    loadDemoProfile,
    clearDemoProfile,
  } = useAppContext();

  const handleClearData = () => {
    const confirmClear = () => {
      clearAllData();
      if (Platform.OS === "web") {
        window.alert("Your data has been cleared.");
      } else {
        Alert.alert("Data Cleared", "All your visit recordings, chat history, and planner questions have been removed.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to delete all your data? This includes all visit recordings, chat history, and planner questions. This action cannot be undone.")) {
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

  const confirmDemo = (label: string, action: () => Promise<void>) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${label}? This replaces all current data on this device.`)) action();
    } else {
      Alert.alert(label, "This replaces all current data on this device.", [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => action() },
      ]);
    }
  };

  const getStyleLabel = (level: number): string => {
    if (level <= 6) return "Essential";
    if (level <= 8) return "Balanced";
    if (level <= 10) return "Detailed";
    return "Comprehensive";
  };

  return (
    <ScreenKeyboardAwareScrollView>
      <View style={styles.container}>
        <ThemedView style={[styles.inputCard, { backgroundColor: theme.backgroundSecondary }]}>
          <TextInput
            style={[styles.nameInput, { color: theme.text }]}
            value={userName}
            onChangeText={setUserName}
            placeholder="Your name"
            placeholderTextColor={theme.textSecondary}
          />
        </ThemedView>

        <SettingSection title="Recording">
          <SettingToggle
            label="High Quality"
            value={recordingQuality === "high"}
            onValueChange={(value) => setRecordingQuality(value ? "high" : "medium")}
          />
        </SettingSection>

        <SettingSection title="Auto-Save">
          <SettingToggle label="Save summaries automatically" value={autoSave} onValueChange={setAutoSave} />
        </SettingSection>

        <SettingSection title="Privacy & Data">
          <ThemedView style={[styles.privacyCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.privacyItem}>
              <Icon name="home" size={20} color={theme.primary} />
              <View style={styles.privacyItemText}>
                <ThemedText style={styles.privacyItemTitle}>Data Storage</ThemedText>
                <ThemedText style={[styles.privacyItemDescription, { color: theme.textSecondary }]}>
                  All data is stored on your device
                </ThemedText>
              </View>
            </View>
            
            <View style={styles.privacyItem}>
              <Icon name="sparkles" size={20} color={theme.primary} />
              <View style={styles.privacyItemText}>
                <ThemedText style={styles.privacyItemTitle}>AI Processing</ThemedText>
                <ThemedText style={[styles.privacyItemDescription, { color: theme.textSecondary }]}>
                  Recordings sent securely to Google AI for transcription
                </ThemedText>
              </View>
            </View>
            
            {privacyConsent && privacyConsentDate ? (
              <View style={styles.privacyItem}>
                <Icon name="checkmark-circle" size={20} color={theme.accent} />
                <View style={styles.privacyItemText}>
                  <ThemedText style={styles.privacyItemTitle}>Privacy Acknowledged</ThemedText>
                  <ThemedText style={[styles.privacyItemDescription, { color: theme.textSecondary }]}>
                    {privacyConsentDate.toLocaleDateString()}
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </ThemedView>

          <View style={styles.dataStats}>
            <ThemedText style={[styles.dataStatsText, { color: theme.textSecondary }]}>
              {visits.length} visit{visits.length !== 1 ? "s" : ""} saved on this device
            </ThemedText>
          </View>

          <Pressable
            onPress={handleClearData}
            style={[styles.deleteButton, { borderColor: "#FF6B6B" }]}
          >
            <Icon name="trash" size={16} color="#FF6B6B" />
            <ThemedText style={[styles.deleteButtonText, { color: "#FF6B6B" }]}>
              Delete All My Data
            </ThemedText>
          </Pressable>
        </SettingSection>

        <SettingSection title="Communication Style">
          <View style={styles.readingLevelRow}>
            <View>
              <ThemedText>Summary Detail</ThemedText>
              <ThemedText style={[styles.readingLevelValue, { color: theme.textSecondary }]}>
                {getStyleLabel(readingLevel)}
              </ThemedText>
            </View>
            <Pressable
              onPress={resetOnboarding}
              style={[styles.redoButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
            >
              <Icon name="refresh" size={16} color={theme.primary} />
              <ThemedText style={[styles.redoButtonText, { color: theme.primary }]}>
                Redo Setup
              </ThemedText>
            </Pressable>
          </View>
        </SettingSection>

                {isAdmin && (
          <SettingSection title="Demo Profiles">
            <View style={{ gap: Spacing.sm }}>
              <Pressable
                onPress={() => confirmDemo("Load Low-Literacy Demo", () => loadDemoProfile("low"))}
                style={[styles.redoButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Icon name="person" size={16} color={theme.primary} />
                <ThemedText style={[styles.redoButtonText, { color: theme.primary }]}>
                  Load Low-Literacy Demo
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => confirmDemo("Load High-Literacy Demo", () => loadDemoProfile("high"))}
                style={[styles.redoButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <Icon name="person" size={16} color={theme.primary} />
                <ThemedText style={[styles.redoButtonText, { color: theme.primary }]}>
                  Load High-Literacy Demo
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => confirmDemo("Reset Demo", clearDemoProfile)}
                style={[styles.redoButton, { borderColor: "#FF6B6B" }]}
              >
                <Icon name="trash" size={16} color="#FF6B6B" />
                <ThemedText style={[styles.redoButtonText, { color: "#FF6B6B" }]}>
                  Reset Demo
                </ThemedText>
              </Pressable>
            </View>
          </SettingSection>
        )}
        
        {isAdmin && (
          <Button onPress={() => navigation.navigate("AdminSources")}>
            <Icon name="document" size={20} color="white" />
            Manage Trusted Sources
          </Button>
        )}

        <View style={styles.adminToggle}>
          <Pressable
            onPress={() => setIsAdmin(!isAdmin)}
            style={[
              styles.adminButton,
              {
                backgroundColor: isAdmin ? theme.primary : theme.backgroundSecondary,
                borderColor: theme.border,
              },
            ]}
          >
            <Icon name="shield" size={16} color={isAdmin ? "white" : theme.textSecondary} />
            <ThemedText style={{ color: isAdmin ? "white" : theme.textSecondary, fontSize: 12 }}>
              {isAdmin ? "Admin Mode" : "Enable Admin"}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.aboutSection}>
          <Image 
            source={InspiredLogo} 
            style={styles.aboutLogo}
            resizeMode="contain"
          />
          <ThemedText style={[styles.version, { color: theme.textSecondary }]}>
            Version 1.0.0
          </ThemedText>
          <ThemedText style={[styles.copyright, { color: theme.textSecondary }]}>
            Helping parents understand and manage
          </ThemedText>
          <ThemedText style={[styles.copyright, { color: theme.textSecondary }]}>
            their child's pulmonary care journey
          </ThemedText>
        </View>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingSection}>
      <ThemedText style={styles.settingTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function SettingToggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { theme } = useTheme();

  return (
    <Pressable onPress={() => onValueChange(!value)} style={styles.toggleRow}>
      <ThemedText>{label}</ThemedText>
      <View
        style={[
          styles.toggle,
          {
            backgroundColor: value ? theme.primary : theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            {
              backgroundColor: "white",
              transform: [{ translateX: value ? 18 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  inputCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  settingSection: {
    gap: Spacing.md,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  readingLevelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  readingLevelValue: {
    fontSize: 14,
    marginTop: 2,
  },
  redoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  redoButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  adminToggle: {
    alignItems: "center",
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  aboutSection: {
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  aboutLogo: {
    width: 160,
    height: 120,
    marginBottom: Spacing.sm,
  },
  version: {
    fontSize: 12,
    marginTop: Spacing.sm,
  },
  copyright: {
    fontSize: 12,
    textAlign: "center",
  },
  privacyCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  privacyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  privacyItemText: {
    flex: 1,
  },
  privacyItemTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  privacyItemDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  dataStats: {
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dataStatsText: {
    fontSize: 13,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
