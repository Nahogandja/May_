/**
 * Retained for backwards compatibility with the existing passenger/driver
 * screens. The app-wide LocalRideReminderBridge handles permission, polling,
 * scheduling, cancellation and tap-to-open without duplicate Alert popups.
 */
export function useUpcomingRideReminder(_role: 'Passenger' | 'Driver' | undefined): void {
  // Reminders are managed once at the app root.
}
