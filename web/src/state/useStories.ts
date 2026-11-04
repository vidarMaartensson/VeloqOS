import { useEffect, useState } from 'react';
import { api as defaultApi, type Api } from '../api/client';
import type { LinearIssue } from './types';

/** The open project's stories: null while loading, the reason when Linear did not answer. */
export function useStories(projectId: string | null, linked: boolean, api: Api = defaultApi): LinearIssue[] | null | string {
  const [stories, setStories] = useState<{ id: string; value: LinearIssue[] | string } | null>(null);

  useEffect(() => {
    if (!projectId || !linked) return;
    let live = true;
    api
      .stories(projectId)
      .then((value) => live && setStories({ id: projectId, value }))
      .catch((e) => live && setStories({ id: projectId, value: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, [api, projectId, linked]);

  return stories?.id === projectId ? stories.value : null;
}
