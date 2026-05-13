/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Default Action - What happens when you press Enter on a contact. */
  "defaultAction": "tel" | "facetime-audio" | "facetime"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `call` command */
  export type Call = ExtensionPreferences & {}
  /** Preferences accessible in the `refresh-contacts` command */
  export type RefreshContacts = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `call` command */
  export type Call = {
  /** Name */
  "name": string
}
  /** Arguments passed to the `refresh-contacts` command */
  export type RefreshContacts = {}
}

