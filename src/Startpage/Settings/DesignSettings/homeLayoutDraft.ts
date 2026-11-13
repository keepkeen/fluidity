import {
  getDefaultHomeLayout,
  HomeLayoutState,
  HomePageShortcutModifier,
} from "../../../services/homeLayout"

/** Pure draft operations: settings must not mutate the live home layout early. */
export const createHomeLayoutResetDraft = (): HomeLayoutState =>
  getDefaultHomeLayout()

export const changeHomePageShortcutDraft = (
  layout: HomeLayoutState,
  pageShortcutModifier: HomePageShortcutModifier
): HomeLayoutState => ({ ...layout, pageShortcutModifier })
