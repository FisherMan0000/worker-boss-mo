/**
 * Cloudflare Worker for Twitch Stats Proxy
 * Fetches data from Twitch API for momayallegrala
 */

const TWITCH_USER = "momayallegrala";

interface CloudflareRequest extends Request {
  env?: {
    TWITCH_CLIENT_ID: string;
    TWITCH_CLIENT_SECRET: string;
  };
}

interface TwitchStats {
  user: {
    id: string;
    login: string;
    displayName: string;
    profileImageUrl: string;
    bio: string;
    createdAt: string;
  };
  channel: {
    gameId: string;
    gameName: string;
    title: string;
  };
  stream: {
    isLive: boolean;
    viewerCount: number;
    startedAt: string;
  };
  latestVod: {
    publishedAt: string;
    url?: string;
    thumbnailUrl?: string;
  };
  stats: {
    followerCount: number;
    subscriberCount: number;
  };
  recentCategories?: Array<{
    id: string;
    name: string;
    boxArtUrl: string;
    publishedAt: string;
    vodUrl?: string;
    vodTitle?: string;
  }>;
}

async function getAppAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  try {
    console.log("[Twitch Worker] Requesting access token...");
    console.log(
      "[Twitch Worker] Using Client ID:",
      clientId.substring(0, 8) + "...",
    );

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });

    console.log("[Twitch Worker] Request body:", params.toString());

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Twitch Worker] Token request failed: ${response.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      throw new Error(
        `Failed to get access token: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      console.error(
        `[Twitch Worker] OAuth error:`,
        data.error,
        data.error_description,
      );
      throw new Error(`OAuth error: ${data.error} - ${data.error_description}`);
    }

    console.log("[Twitch Worker] Access token obtained successfully");
    return data.access_token;
  } catch (error) {
    console.error("[Twitch Worker] Error getting access token:", error);
    throw error;
  }
}

async function getTwitchUser(
  accessToken: string,
  clientId: string,
  login: string,
): Promise<TwitchStats["user"] & { id: string }> {
  try {
    console.log(`[Twitch Worker] Fetching user: ${login}`);
    const response = await fetch(
      `https://api.twitch.tv/helix/users?login=${login}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Twitch Worker] User fetch failed: ${response.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      throw new Error(
        `Failed to fetch user: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        login: string;
        display_name: string;
        profile_image_url: string;
        description: string;
        created_at: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      throw new Error(`User ${login} not found`);
    }

    const user = data.data[0];
    console.log(
      `[Twitch Worker] User fetched: ${user.display_name} (${user.id})`,
    );
    return {
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      profileImageUrl: user.profile_image_url,
      bio: user.description,
      createdAt: user.created_at,
    };
  } catch (error) {
    console.error("[Twitch Worker] Error fetching user:", error);
    throw error;
  }
}

async function getChannelInfo(
  accessToken: string,
  clientId: string,
  broadcasterId: string,
): Promise<TwitchStats["channel"]> {
  try {
    console.log(
      `[Twitch Worker] Fetching channel info for broadcaster: ${broadcasterId}`,
    );
    const response = await fetch(
      `https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Twitch Worker] Channel fetch failed: ${response.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      throw new Error(
        `Failed to fetch channel: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        game_id: string;
        game_name: string;
        title: string;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      throw new Error(`Channel not found for broadcaster ${broadcasterId}`);
    }

    const channel = data.data[0];
    console.log(`[Twitch Worker] Channel fetched: ${channel.game_name}`);
    return {
      gameId: channel.game_id,
      gameName: channel.game_name,
      title: channel.title,
    };
  } catch (error) {
    console.error("[Twitch Worker] Error fetching channel:", error);
    throw error;
  }
}

async function getStreamInfo(
  accessToken: string,
  clientId: string,
  userId: string,
): Promise<TwitchStats["stream"]> {
  try {
    console.log(`[Twitch Worker] Fetching stream info for user: ${userId}`);
    const response = await fetch(
      `https://api.twitch.tv/helix/streams?user_id=${userId}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Twitch Worker] Stream fetch failed: ${response.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      throw new Error(
        `Failed to fetch stream: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        viewer_count: number;
        started_at: string;
      }>;
    };

    if (data.data.length === 0) {
      console.log(`[Twitch Worker] Stream not live`);
      return {
        isLive: false,
        viewerCount: 0,
        startedAt: "",
      };
    }

    const stream = data.data[0];
    console.log(
      `[Twitch Worker] Stream is live with ${stream.viewer_count} viewers`,
    );
    return {
      isLive: true,
      viewerCount: stream.viewer_count,
      startedAt: stream.started_at,
    };
  } catch (error) {
    console.error("[Twitch Worker] Error fetching stream:", error);
    throw error;
  }
}

async function getLatestVod(
  accessToken: string,
  clientId: string,
  userId: string,
): Promise<TwitchStats["latestVod"]> {
  try {
    console.log(`[Twitch Worker] Fetching latest VOD for user: ${userId}`);
    const response = await fetch(
      `https://api.twitch.tv/helix/videos?user_id=${userId}&first=1&sort=time`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Twitch Worker] VOD fetch failed: ${response.statusText}`);
      console.error(`[Twitch Worker] Response body:`, errorBody);
      throw new Error(
        `Failed to fetch videos: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        published_at: string;
        url: string;
        thumbnail_url: string;
      }>;
    };

    if (data.data.length === 0) {
      console.log(`[Twitch Worker] No VODs found`);
      return {
        publishedAt: new Date().toISOString(),
      };
    }

    console.log(`[Twitch Worker] Latest VOD fetched`);
    return {
      publishedAt: data.data[0].published_at,
      url: data.data[0].url,
      thumbnailUrl: data.data[0].thumbnail_url,
    };
  } catch (error) {
    console.error("[Twitch Worker] Error fetching VOD:", error);
    throw error;
  }
}

async function getRecentCategories(
  accessToken: string,
  clientId: string,
  userId: string,
): Promise<NonNullable<TwitchStats["recentCategories"]>> {
  try {
    console.log(
      `[Twitch Worker] Fetching recent VODs for categories: ${userId}`,
    );
    const vodResponse = await fetch(
      `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=20&sort=time`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!vodResponse.ok) {
      const errorBody = await vodResponse.text();
      console.error(
        `[Twitch Worker] Recent VOD fetch failed: ${vodResponse.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      return [];
    }

    const vodData = (await vodResponse.json()) as {
      data: Array<{
        id: string;
        game_id: string;
        title: string;
        url: string;
        published_at: string;
      }>;
    };

    const recentVods = vodData.data || [];
    const uniqueGameIds = Array.from(
      new Set(
        recentVods
          .map((vod) => vod.game_id)
          .filter((gameId): gameId is string =>
            Boolean(gameId && gameId.trim()),
          ),
      ),
    );

    if (uniqueGameIds.length === 0) {
      return [];
    }

    const gamesQuery = uniqueGameIds
      .map((gameId) => `id=${encodeURIComponent(gameId)}`)
      .join("&");
    const gamesResponse = await fetch(
      `https://api.twitch.tv/helix/games?${gamesQuery}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!gamesResponse.ok) {
      const errorBody = await gamesResponse.text();
      console.error(
        `[Twitch Worker] Games fetch failed: ${gamesResponse.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      return [];
    }

    const gamesData = (await gamesResponse.json()) as {
      data: Array<{
        id: string;
        name: string;
        box_art_url: string;
      }>;
    };

    const gamesById = new Map(gamesData.data.map((game) => [game.id, game]));

    const recentCategories: NonNullable<TwitchStats["recentCategories"]> =
      recentVods.flatMap((vod) => {
        if (!vod.game_id) {
          return [];
        }

        const game = gamesById.get(vod.game_id);
        if (!game) {
          return [];
        }

        return [
          {
            id: game.id,
            name: game.name,
            boxArtUrl: game.box_art_url
              .replace("{width}", "285")
              .replace("{height}", "380"),
            publishedAt: vod.published_at,
            vodUrl: vod.url,
            vodTitle: vod.title,
          },
        ];
      });

    const uniqueRecentCategories = Array.from(
      new Map(
        recentCategories.map((category) => [category.id, category]),
      ).values(),
    );

    console.log(
      `[Twitch Worker] Recent categories fetched: ${uniqueRecentCategories.length}`,
    );
    return uniqueRecentCategories;
  } catch (error) {
    console.error("[Twitch Worker] Error fetching recent categories:", error);
    return [];
  }
}

async function getUserFollowers(
  accessToken: string,
  clientId: string,
  userId: string,
): Promise<number> {
  try {
    console.log(`[Twitch Worker] Fetching follower count for user: ${userId}`);

    // Use the newer /channels/followers endpoint which works with App Access Token
    const response = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[Twitch Worker] Followers fetch failed: ${response.statusText}`,
      );
      console.error(`[Twitch Worker] Response body:`, errorBody);
      console.warn(
        `[Twitch Worker] Could not fetch followers, using 0 as fallback`,
      );
      return 0;
    }

    const data = (await response.json()) as {
      total: number;
      data: Array<{
        user_id: string;
        user_login: string;
        user_name: string;
        followed_at: string;
      }>;
    };

    console.log(`[Twitch Worker] Follower count: ${data.total}`);
    return data.total;
  } catch (error) {
    console.error("[Twitch Worker] Error fetching followers:", error);
    console.warn(`[Twitch Worker] Returning 0 followers due to error`);
    return 0;
  }
}

export async function fetchTwitchStats(
  clientId: string,
  clientSecret: string,
): Promise<TwitchStats> {
  try {
    const accessToken = await getAppAccessToken(clientId, clientSecret);

    const user = await getTwitchUser(accessToken, clientId, TWITCH_USER);
    const channel = await getChannelInfo(accessToken, clientId, user.id);
    const stream = await getStreamInfo(accessToken, clientId, user.id);
    const latestVod = await getLatestVod(accessToken, clientId, user.id);
    const recentCategories = await getRecentCategories(
      accessToken,
      clientId,
      user.id,
    );
    const resolvedRecentCategories =
      recentCategories.length > 0
        ? recentCategories
        : channel.gameId && channel.gameName
          ? [
              {
                id: channel.gameId,
                name: channel.gameName,
                boxArtUrl: "",
                publishedAt: latestVod.publishedAt,
                vodUrl: latestVod.url,
                vodTitle: channel.title,
              },
            ]
          : [];
    const followerCount = await getUserFollowers(
      accessToken,
      clientId,
      user.id,
    );

    return {
      user,
      channel,
      stream,
      latestVod,
      recentCategories: resolvedRecentCategories,
      stats: {
        followerCount,
        subscriberCount: 0,
      },
    };
  } catch (error) {
    console.error("Error fetching Twitch stats:", error);
    throw error;
  }
}

// Cloudflare Worker Handler
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (
      request.method !== "GET" ||
      !request.url.includes("/api/twitch-stats")
    ) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers,
      });
    }

    try {
      const clientId = env.TWITCH_CLIENT_ID;
      const clientSecret = env.TWITCH_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({
            error: "Missing Twitch credentials",
          }),
          {
            status: 400,
            headers,
          },
        );
      }

      const stats = await fetchTwitchStats(clientId, clientSecret);
      return new Response(JSON.stringify(stats), {
        status: 200,
        headers,
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal error",
        }),
        {
          status: 500,
          headers,
        },
      );
    }
  },
};
