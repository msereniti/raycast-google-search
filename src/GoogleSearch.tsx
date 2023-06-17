import { ActionPanel, Action, List, Icon, LocalStorage } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import * as React from "react";
import google from "googlethis";
import axios from "axios";
import { LocalePicker } from "./LocalePicker";

export const GoogleSearch = () => {
  const { data: historyRaw, isLoading: gettingHistory } = usePromise(LocalStorage.getItem, ["history"]);
  const { data: lastQuery, isLoading: gettingLastQuery } = usePromise(LocalStorage.getItem, ["last-query"]);
  const { data: storedLocale, isLoading: gettingLocale } = usePromise(LocalStorage.getItem, ["locale"]);
  const [locale, setLocale] = React.useState("en");
  React.useEffect(() => {
    if (!storedLocale) return;
    setLocale(storedLocale as string);
  }, [storedLocale]);

  const [page, setPage] = React.useState(0);

  const [query, setQuery] = React.useState("");
  const [searchedQuery, setSearchedQuery] = React.useState("");
  const [showAllSuggestionsForQuery, setShowAllSuggestionsForQuery] = React.useState("");
  const [historyList, setHistoryList] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!historyRaw) return;
    let history: string[] = [];
    try {
      if (typeof historyRaw === "string") history = JSON.parse(historyRaw);
    } catch (err) {
      /* do nothing */
    }
    if (!Array.isArray(history) || history.some((item) => typeof item !== "string")) {
      history = [];
    }
    setHistoryList(history);
  }, [historyRaw]);

  React.useEffect(() => {
    if (typeof lastQuery !== "string") return;
    try {
      const { query, page, time } = JSON.parse(lastQuery);
      if (Date.now() - time > 10 * 60 * 1000) return;
      setQuery(query as string);
      setSearchedQuery(query as string);
      setPage(page as number);
    } catch (err) {
      /* do nothing */
    }
  }, [lastQuery]);

  const suggestionsAbortControllerRef = React.useRef<AbortController>();
  const getSuggestionsAbortControllerSignal = React.useCallback(
    () => suggestionsAbortControllerRef.current?.signal as AbortSignal,
    []
  );
  const { data: suggestionsData, isLoading: isLoadingSuggestions } = useCachedPromise(
    getGoogleSuggestions,
    [query, locale, getSuggestionsAbortControllerSignal],
    { execute: query.length > 0 && query !== searchedQuery, abortable: suggestionsAbortControllerRef }
  );

  const searchAbortControllerRef = React.useRef<AbortController>();
  const getGoogleSearchResults = React.useCallback(
    async (query: string, page: number, locale: string): ReturnType<typeof google.search> => {
      try {
        return await google.search(query, {
          page,
          safe: false,
          parse_ads: false,
          additional_params: { hl: locale },
          axios_config: {
            get signal() {
              return searchAbortControllerRef.current?.signal;
            },
          },
        });
      } catch (error) {
        if ((error as unknown as { info: { message: string } })?.info?.message === "canceled")
          return { results: [] } as unknown as ReturnType<typeof google.search>;
        else throw error;
      }
    },
    []
  );
  const { data: searchData, isLoading: isLoadingSearch } = useCachedPromise(
    getGoogleSearchResults,
    [query, page, locale],
    { execute: query.length > 5 || query === searchedQuery, abortable: searchAbortControllerRef }
  );

  React.useEffect(
    () => () => {
      suggestionsAbortControllerRef.current?.abort();
      searchAbortControllerRef.current?.abort();
    },
    []
  );

  const saveToHistory = React.useCallback(async (query: string, page: number) => {
    await LocalStorage.setItem("last-query", JSON.stringify({ query, time: Date.now(), page }));
    const historyRaw = await LocalStorage.getItem("history");
    let history: string[] = [];
    try {
      if (typeof historyRaw === "string") history = JSON.parse(historyRaw);
    } catch (err) {
      /* do nothing */
    }
    if (!Array.isArray(history) || history.some((item) => typeof item !== "string")) {
      history = [];
    }
    if (history.length > 100) {
      history.length = 100;
    }
    history = history.filter((item) => item !== query);
    history.unshift(query);
    await LocalStorage.setItem("history", JSON.stringify(history));
    setHistoryList(history);
  }, []);
  const performSearch = React.useCallback(() => {
    setSearchedQuery(query);
    setPage(0);
    saveToHistory(query, 0);
  }, [query, page]);
  const searchSuggestion = React.useCallback((suggestion: string) => {
    setQuery(suggestion);
    setSearchedQuery(suggestion);
    setPage(0);
    saveToHistory(suggestion, 0);
  }, []);
  const nextPage = React.useCallback(() => {
    setPage(page + 1);
    setSearchedQuery(query);
    saveToHistory(query, page + 1);
  }, [query, page]);
  const prevPage = React.useCallback(() => {
    setPage(Math.max(0, page - 1));
    setSearchedQuery(query);
    saveToHistory(query, Math.max(0, page - 1));
  }, [query, page]);
  const removeFromHistory = React.useCallback(async (suggestion: string) => {
    const historyRaw = await LocalStorage.getItem("history");
    let history: string[] = [];
    try {
      if (typeof historyRaw === "string") history = JSON.parse(historyRaw);
    } catch (err) {
      /* do nothing */
    }
    if (!Array.isArray(history) || history.some((item) => typeof item !== "string")) {
      history = [];
    }
    if (history.length > 100) {
      history.length = 100;
    }
    history = history.filter((item) => item !== suggestion);
    await LocalStorage.setItem("history", JSON.stringify(history));
    setHistoryList(history);
  }, []);

  const suggestionsLimit = React.useMemo(
    () => (query === showAllSuggestionsForQuery ? 100 : 4),
    [query, showAllSuggestionsForQuery]
  );
  const suggestions = React.useMemo(() => {
    if (query === searchedQuery) return [];
    return suggestionsData ?? [];
  }, [suggestionsData, query, searchedQuery]);
  const results = React.useMemo(() => searchData?.results.filter((result) => !result.is_sponsored) ?? [], [searchData]);

  const suggestionsSubtitle = React.useMemo(() => {
    if (!suggestionsData?.length) return undefined;
    return `Showing ${suggestions.slice(0, suggestionsLimit).length + 1} suggestions of ${(suggestionsData ?? []).length + 1
      }`;
  }, [suggestions, suggestionsLimit, suggestionsData]);
  const handleResultOpen = React.useCallback(() => searchSuggestion(query), [query, searchSuggestion])

  return (
    <List
      isLoading={gettingHistory || gettingLocale || gettingLastQuery || isLoadingSuggestions || isLoadingSearch}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Search in Google`}
      throttle
      actions={
        <ActionPanel>
          <Action title="Search" onAction={performSearch} />
        </ActionPanel>
      }
    >
      {query.length === 0 && (
        <>
          <List.Section title="Search history">
            {historyList.map((suggestion) => (
              <SearchSuggestionItem
                key={suggestion}
                suggestion={suggestion}
                searchSuggestion={searchSuggestion}
                putSuggestionInSearch={setQuery}
                removeFromHistory={removeFromHistory}
              />
            ))}
          </List.Section>
          <List.Section title="Preferences">
            <List.Item
              title="Change Search Locale"
              subtitle={`Current locale is ${locale}`}
              actions={
                <ActionPanel>
                  <Action.Push title="Change Search Locale" target={<LocalePicker onChange={setLocale} />} />
                </ActionPanel>
              }
            />
          </List.Section>
        </>
      )}
      {query.length > 0 && (
        <>
          <List.Section title="Suggestions" subtitle={suggestionsSubtitle}>
            {query !== searchedQuery && (
              <SearchSuggestionItem
                key={query}
                suggestion={query}
                searchSuggestion={searchSuggestion}
                putSuggestionInSearch={setQuery}
                setShowAllSuggestionsForQuery={setShowAllSuggestionsForQuery}
              />
            )}
            {suggestions.slice(0, suggestionsLimit).map((suggestion) => (
              <SearchSuggestionItem
                key={suggestion}
                suggestion={suggestion}
                searchSuggestion={searchSuggestion}
                putSuggestionInSearch={setQuery}
                setShowAllSuggestionsForQuery={setShowAllSuggestionsForQuery}
              />
            ))}
          </List.Section>
          {searchData && <Snippets searchData={searchData} search={setQuery} onOpen={handleResultOpen} />}
          <List.Section title="Results" subtitle={`Page ${page + 1}`}>
            {results.length > 0 && page > 0 && (
              <List.Item
                title="Previous search results page"
                icon={Icon.ArrowLeft}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action title="Previous Search Results Page" onAction={prevPage} />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            )}
            {results.map((searchResult) => (
              <SearchListItem key={searchResult.url} searchResult={searchResult} onOpen={handleResultOpen} />
            ))}
            {results.length > 0 && (
              <List.Item
                title="Next Search Results Page"
                icon={Icon.ArrowRight}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      <Action title="Next Search Results Page" onAction={nextPage} />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            )}
          </List.Section>
        </>
      )}
    </List>
  );
};

const SearchSuggestionItem = ({
  suggestion,
  searchSuggestion,
  putSuggestionInSearch,
  setShowAllSuggestionsForQuery,
  removeFromHistory,
}: {
  suggestion: string;
  searchSuggestion: (suggestion: string) => void;
  putSuggestionInSearch: (suggestion: string) => void;
  setShowAllSuggestionsForQuery?: (suggestion: string) => void;
  removeFromHistory?: (suggestion: string) => void;
}) => {
  const searchIt = React.useCallback(() => searchSuggestion(suggestion), [suggestion, searchSuggestion]);
  const putInSearchQuery = React.useCallback(
    () => putSuggestionInSearch(suggestion),
    [suggestion, putSuggestionInSearch]
  );
  const showAllSuggestions = React.useCallback(
    () => setShowAllSuggestionsForQuery?.(suggestion),
    [suggestion, putSuggestionInSearch]
  );
  const handleRemoveFromHsitory = React.useCallback(
    () => removeFromHistory?.(suggestion),
    [suggestion, putSuggestionInSearch]
  );

  return (
    <List.Item
      title={suggestion}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Search It" onAction={searchIt} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              title="Put in Search Query"
              shortcut={{ modifiers: ["cmd"], key: "enter" }}
              onAction={putInSearchQuery}
            />
            {setShowAllSuggestionsForQuery && (
              <Action
                title="Show All Suggestions"
                shortcut={{ modifiers: ["cmd"], key: "s" }}
                onAction={showAllSuggestions}
              />
            )}
            {removeFromHistory && (
              <Action
                title="Remove Item From History"
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={handleRemoveFromHsitory}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
};
const SearchListItem = ({ searchResult, onOpen }: { searchResult: SearchResult, onOpen: () => void }) => {
  return (
    <List.Item
      title={searchResult.title}
      subtitle={searchResult.description}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in Browser" url={searchResult.url} onOpen={onOpen} />
        </ActionPanel>
      }
    />
  );
};

const Snippets = ({
  searchData,
  search,
  onOpen
}: {
  searchData: PromiseResult<ReturnType<typeof google.search>>;
  search: (query: string) => void;
  onOpen: () => void;
}) => {
  const result = [];

  const applySuggestion = React.useCallback(() => search(searchData.did_you_mean), [searchData]);

  if (searchData.did_you_mean) {
    result.push(
      <List.Item
        title={searchData.did_you_mean}
        subtitle={"Suggested query correction"}
        actions={
          <ActionPanel>
            <Action title="Apply Suggestion" onAction={applySuggestion} />
          </ActionPanel>
        }
        icon={Icon.TextCursor}
      />
    );
  }
  if (searchData.dictionary) {
    for (const definition of searchData.dictionary.definitions ?? []) {
      result.push(<List.Item title={definition} subtitle={"Definition"} />);
    }
    for (const example of searchData.dictionary.examples ?? []) {
      result.push(<List.Item title={example} subtitle={"Example"} />);
    }
    if (searchData.dictionary.phonetic) {
      result.push(<List.Item title={searchData.dictionary.phonetic} subtitle={"Phonetic"} icon={Icon.Headphones} />);
    }
    if (searchData.dictionary.word) {
      result.push(<List.Item title={searchData.dictionary.word} subtitle={"Word"} icon={Icon.Text} />);
    }
  }
  if (searchData.featured_snippet?.title) {
    result.push(
      <List.Item
        title={searchData.featured_snippet.title}
        subtitle={searchData.featured_snippet.description ?? undefined}
        icon={Icon.Info}
        actions={
          searchData.featured_snippet.url && (
            <ActionPanel>
              <ActionPanel.Section>
                <Action.OpenInBrowser title="Open in Browser" url={searchData.featured_snippet.url} onOpen={onOpen} />
              </ActionPanel.Section>
            </ActionPanel>
          )
        }
      />
    );
  }
  if (searchData.knowledge_panel) {
    if (searchData.knowledge_panel.title) {
      result.push(
        <List.Item
          title={searchData.knowledge_panel.title}
          subtitle={searchData.knowledge_panel.description ?? undefined}
          actions={
            searchData.knowledge_panel.url && (
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.OpenInBrowser title="Open in Browser" url={searchData.knowledge_panel.url} onOpen={onOpen} />
                </ActionPanel.Section>
              </ActionPanel>
            )
          }
          icon={searchData.knowledge_panel.images[0] ? { source: searchData.knowledge_panel.images[0].url } : Icon.Info}
        />
      );
    }
    // for (const availableOn of searchData.knowledge_panel.available_on ?? []) {
    //   result.push(<List.Item
    //     title={availableOn}
    //     subtitle={"Available on"}
    //     icon={Icon.WristWatch}
    //   />)
    // }
    // for (const book of searchData.knowledge_panel.books ?? []) {
    //   result.push(<List.Item
    //     title={book.title}
    //     subtitle={book.year}
    //     icon={Icon.Book}
    //   />)
    // }
    // for (const song of searchData.knowledge_panel.songs ?? []) {
    //   result.push(<List.Item
    //     title={song.title}
    //     subtitle={song.album}
    //     icon={Icon.Headphones}
    //   />)
    // }
    // for (const movie of searchData.knowledge_panel.tv_shows_and_movies ?? []) {
    //   result.push(<List.Item
    //     title={movie.title}
    //     subtitle={movie.year}
    //     icon={Icon.Video}
    //   />)
    // }
    // if (searchData.knowledge_panel.demonstration) {
    //   result.push(<List.Item
    //     title={searchData.knowledge_panel.demonstration}
    //     subtitle={"Demonstration"}
    //   />)
    // }

    // if (searchData.knowledge_panel.lyrics) {
    //   result.push(<List.Item
    //     title={searchData.knowledge_panel.lyrics}
    //     subtitle={"Lyrics"}
    //     icon={Icon.Text}
    //   />)
    // }
    // for (const metadata of searchData.knowledge_panel.metadata ?? []) {
    //   result.push(<List.Item
    //     title={metadata.title}
    //     subtitle={metadata.value}
    //   />)
    // }
    // for (const social of searchData.knowledge_panel.socials ?? []) {
    //   result.push(<List.Item
    //     title={social.name}
    //     subtitle={'social'}
    //     actions={
    //       <Action.OpenInBrowser title="Open in Browser" url={social.url} />
    //     }
    //   />)
    // }
  }
  if (searchData.location?.title) {
    result.push(
      <List.Item title={searchData.location.title} subtitle={searchData.location.map ?? undefined} icon={Icon.Geopin} />
    );
  }
  if (searchData.time) {
    if (searchData.time.date) {
      result.push(
        <List.Item title={searchData.time.date} subtitle={searchData.time.hours ?? undefined} icon={Icon.Clock} />
      );
    } else if (searchData.time.hours) {
      result.push(<List.Item title={searchData.time.hours} icon={Icon.Clock} />);
    }
  }
  if (searchData.translation?.target_text) {
    result.push(
      <List.Item
        title={searchData.translation.target_text}
        subtitle={`From ${searchData.translation.source_language} to ${searchData.translation.target_language}`}
        icon={Icon.Text}
      />
    );
  }
  // if (searchData.weather && searchData.weather.forecast) {
  //   result.push(<List.Item
  //     title={searchData.weather.forecast}
  //     subtitle={searchData.weather.location ?? undefined}
  //     icon={searchData.weather.image ? { source: searchData.weather.image } : undefined}
  //   />)
  // }

  if (result.length === 0) return null;

  return (
    <List.Section title="Snippets">
      {result.map((item, index) => (
        <React.Fragment key={index}>{item}</React.Fragment>
      ))}
    </List.Section>
  );
};

type SearchResult = {
  title: string;
  description: string;
  url: string;
  is_sponsored: boolean;
  favicons: {
    high_res: string;
    low_res: string;
  };
};

type PromiseResult<P extends Promise<any>> = P extends Promise<infer Result> ? Result : never;

const getGoogleSuggestions = async (query: string, locale: string, getSignal: () => AbortSignal): Promise<string[]> => {
  try {
    if (!query) return [];
    const response = await axios.get(
      `https://suggestqueries.google.com/complete/search?hl=${locale}&output=chrome&q=${encodeURIComponent(query)}`,
      { signal: getSignal() }
    );
    const suggestions = await response.data;
    return suggestions[1] as string[];
  } catch (error) {
    if ((error as unknown as { message: string })?.message === "canceled") return [];
    else throw error;
  }
};
