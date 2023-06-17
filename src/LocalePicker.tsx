import { Action, ActionPanel, List, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import * as React from "react";
import { LocalStorage } from "@raycast/api";
import { title } from "process";

const knownLocales = [
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IN",
  "en-BE",
  "en-SG",
  "en-US",
  "zh-HK",
  "zh-TW",
  "da-DK",
  "nl-NL",
  "nl-BE",
  "fr-FR",
  "fr-CA",
  "fr-BE",
  "de-DE",
  "de-AT",
  "de-CH",
  "de-BE",
  "hi-IN",
  "id-ID",
  "it-IT",
  "ja-JP",
  "ko-KR",
  "no-NO",
  "pl-PL",
  "pt-BR",
  "ru-RU",
  "es-ES",
  "es-ES",
  "es-MX",
  "es-US",
  "es-ES",
  "sv-SE",
  "th-TH",
  "tr-TR",
];

export const LocalePicker = ({ onChange }: { onChange: (locale: string) => void }) => {
  const [query, setQuery] = React.useState("");
  const { data: currentLocale, isLoading: gettingLocale } = usePromise(LocalStorage.getItem, ["locale"]);
  const navigation = useNavigation();
  const setLocale = React.useCallback(
    (locale: string) => async () => {
      onChange(locale);
      await LocalStorage.setItem("locale", locale);
      navigation.pop();
    },
    [onChange]
  );

  return (
    <List
      searchText={query}
      isLoading={gettingLocale}
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Pick your locale"
    >
      <List.Section title="Locales" subtitle={`Current locale: ${currentLocale ?? "en"}`}>
        {knownLocales
          .filter((locale) => locale.toLowerCase().includes(query.toLowerCase()))
          .map((locale) => (
            <List.Item
              title={locale}
              key={title}
              actions={
                <ActionPanel>
                  <Action title={`Set ${locale} As Search Locale`} onAction={setLocale(locale)} />
                </ActionPanel>
              }
            />
          ))}
        {query && !knownLocales.includes(query) && (
          <List.Item
            title={query}
            key={query}
            actions={
              <ActionPanel>
                <Action title={`Set ${query} As Search Locale`} onAction={setLocale(query)} />
              </ActionPanel>
            }
          />
        )}
      </List.Section>
    </List>
  );
};
