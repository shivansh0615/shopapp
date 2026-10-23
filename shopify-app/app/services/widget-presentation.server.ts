/**
 * Widget presentation merge helpers (colors, copy defaults).
 * Kept separate from proxy evaluation to avoid circular imports with route adapters.
 */

import type { AppSettings } from "@prisma/client";
import type { WidgetSettings } from "./gift-engine.server";

export type WidgetColors = {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  barColor: string;
  borderRadius: number;
  progressHeight: number;
  widgetPadding: number;
};

const DEFAULT_BORDER_RADIUS = 16;
const DEFAULT_PROGRESS_HEIGHT = 12;
const DEFAULT_WIDGET_PADDING = 16;
const DEFAULT_UNLOCKED_COPY = "You've unlocked your free gift!";

export function mergeWidgetSettings(
  campaignSettings: WidgetSettings | null,
  appSettings: AppSettings,
): WidgetSettings {
  return {
    heading: campaignSettings?.heading,
    description: campaignSettings?.description,
    unlockedHeading: campaignSettings?.unlockedHeading?.trim() || DEFAULT_UNLOCKED_COPY,
    unlockedDescription: campaignSettings?.unlockedDescription?.trim() || DEFAULT_UNLOCKED_COPY,
    template: campaignSettings?.template ?? appSettings.defaultWidgetTemplate,
    barColor: campaignSettings?.barColor ?? appSettings.primaryColor,
    backgroundColor: campaignSettings?.backgroundColor ?? appSettings.backgroundColor,
    textColor: campaignSettings?.textColor ?? appSettings.textColor,
    borderRadius: campaignSettings?.borderRadius ?? DEFAULT_BORDER_RADIUS,
    progressHeight: campaignSettings?.progressHeight ?? DEFAULT_PROGRESS_HEIGHT,
    widgetPadding: campaignSettings?.widgetPadding ?? DEFAULT_WIDGET_PADDING,
    buttonText: campaignSettings?.buttonText,
    cartProgressBar: campaignSettings?.cartProgressBar,
    cartRecommendations: campaignSettings?.cartRecommendations,
    celebrationPopup: campaignSettings?.celebrationPopup,
  };
}

export function resolveWidgetColors(
  widgetSettings: WidgetSettings,
  appSettings: AppSettings,
): WidgetColors {
  return {
    primaryColor: appSettings.primaryColor,
    backgroundColor: widgetSettings.backgroundColor ?? appSettings.backgroundColor,
    textColor: widgetSettings.textColor ?? appSettings.textColor,
    barColor: widgetSettings.barColor ?? appSettings.primaryColor,
    borderRadius: widgetSettings.borderRadius ?? DEFAULT_BORDER_RADIUS,
    progressHeight: widgetSettings.progressHeight ?? DEFAULT_PROGRESS_HEIGHT,
    widgetPadding: widgetSettings.widgetPadding ?? DEFAULT_WIDGET_PADDING,
  };
}
