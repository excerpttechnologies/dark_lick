import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Image,
  StyleSheet,
  Dimensions,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TouchableWithoutFeedback,
  TextInput,
  Keyboard,
  Pressable,
  AppState,
  Alert,
  Platform,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as Font from "expo-font";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

WebBrowser.maybeCompleteAuthSession();

const { height } = Dimensions.get("window");
const FONT_REGULAR = "AnonymousPro-Regular";
const FONT_BOLD = "AnonymousPro-Bold";

const USER_STORAGE_KEY = "@saved_user";

const createTimeoutPromise = (ms) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timeout")), ms);
  });
};

const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
  return Promise.race([fetch(url, options), createTimeoutPromise(timeout)]);
};

const CustomCenteredInput = ({
  value,
  onChangeText,
  placeholder,
  style,
  keyboardType,
  returnKeyType,
  autoCorrect,
  autoCapitalize,
  placeholderTextColor,
  inputType = "numeric",
  maxLength = 50,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const hiddenInputRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [internalValue, setInternalValue] = useState(value);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (!isUpdatingRef.current) setInternalValue(value);
  }, [value]);

  useEffect(() => {
    if (!isFocused) return;
    const interval = setInterval(() => setVisible((v) => !v), 500);
    return () => clearInterval(interval);
  }, [isFocused]);

  const handleTextChange = (newText) => {
    isUpdatingRef.current = true;
    const processedText =
      inputType === "numeric" ? newText.replace(/[^0-9]/g, "") : newText;
    setInternalValue(processedText);
    requestAnimationFrame(() => {
      onChangeText(processedText);
      requestAnimationFrame(() => {
        isUpdatingRef.current = false;
      });
    });
  };

  const handlePress = (event) => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
      if (internalValue && event.nativeEvent) {
        const { locationX } = event.nativeEvent;
        const textWidth = internalValue.length * 9;
        const tapPosition = Math.round(
          (locationX / textWidth) * internalValue.length,
        );
        const cursorPos = Math.max(
          0,
          Math.min(internalValue.length, tapPosition),
        );
        setTimeout(
          () => setSelection({ start: cursorPos, end: cursorPos }),
          10,
        );
      }
    }
  };

  const isEmpty = !internalValue || internalValue.length === 0;

  return (
    <View>
      <Pressable
        onPress={handlePress}
        style={[style, styles.customInputContainer]}
      >
        <View style={styles.displayInput}>
          {isEmpty && !isFocused && (
            <Text
              style={[
                { color: placeholderTextColor },
                styles.customPlaceholder,
              ]}
            >
              {placeholder}
            </Text>
          )}
          {isEmpty && isFocused && (
            <View style={styles.placeholderContainer}>
              <Text
                style={[
                  { color: placeholderTextColor },
                  styles.customPlaceholder,
                ]}
              >
                {placeholder}
              </Text>
              <View style={styles.centerCursorContainer}>
                <Text style={[styles.cursor, { opacity: visible ? 1 : 0 }]}>
                  |
                </Text>
              </View>
            </View>
          )}
          {!isEmpty && !isFocused && (
            <Text style={styles.customInputText}>{internalValue}</Text>
          )}
          {!isEmpty && isFocused && (
            <View style={{ flexDirection: "row" }}>
              <Text style={styles.customInputText}>
                {internalValue.substring(0, selection.start)}
              </Text>
              <Text
                style={[styles.cursor, { opacity: visible ? 1 : 0, width: 2 }]}
              >
                |
              </Text>
              <Text style={styles.customInputText}>
                {internalValue.substring(selection.start)}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      <TextInput
        ref={hiddenInputRef}
        style={[
          styles.hiddenInput,
          { position: "absolute", width: "100%", height: 40, opacity: 0 },
        ]}
        value={internalValue}
        onChangeText={handleTextChange}
        onFocus={() => {
          setIsFocused(true);
          setVisible(true);
        }}
        onBlur={() => {
          setIsFocused(false);
          isUpdatingRef.current = false;
        }}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        autoFocus={false}
        maxLength={maxLength}
        caretHidden={true}
      />
    </View>
  );
};

const ScrollableTextArea = React.memo(
  ({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor = "#888",
    maxLength,
    onScrollEnabledChange,
  }) => {
    const textInputRef = useRef(null);
    const [scrollY, setScrollY] = useState(0);
    const [contentHeight, setContentHeight] = useState(0);
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollStartY = useRef(0);
    const scrollThreshold = 10;
    const containerHeight = 120;
    const hasScroll = contentHeight > containerHeight;
    const scrollbarHeight = contentHeight
      ? Math.max((containerHeight / contentHeight) * containerHeight, 30)
      : containerHeight;
    const maxScrollbarPosition = containerHeight - scrollbarHeight;
    const scrollbarPosition = hasScroll
      ? Math.min(
          (scrollY / (contentHeight - containerHeight)) * maxScrollbarPosition,
          maxScrollbarPosition,
        )
      : 0;

    return (
      <View
        style={styles.simpleScrollContainer}
        onTouchStart={(e) => {
          scrollStartY.current = e.nativeEvent.pageY;
          setIsScrolling(false);
        }}
        onTouchMove={(e) => {
          const moveDistance = Math.abs(
            e.nativeEvent.pageY - scrollStartY.current,
          );
          if (moveDistance > scrollThreshold && !isScrolling) {
            setIsScrolling(true);
            onScrollEnabledChange?.(false);
          }
        }}
        onTouchEnd={() => {
          if (isScrolling) {
            setTimeout(() => {
              onScrollEnabledChange?.(true);
              setIsScrolling(false);
            }, 100);
          } else {
            onScrollEnabledChange?.(true);
          }
        }}
      >
        <TextInput
          ref={textInputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor}
          maxLength={maxLength}
          multiline
          cursorColor="#888"
          style={styles.simpleScrollInput}
          textAlignVertical="top"
          onContentSizeChange={(e) =>
            setContentHeight(e.nativeEvent.contentSize.height)
          }
          onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
        />
        {hasScroll && (
          <View style={styles.customScrollbarTrack}>
            <View
              style={[
                styles.customScrollbarThumb,
                {
                  height: scrollbarHeight,
                  transform: [{ translateY: scrollbarPosition }],
                },
              ]}
            />
          </View>
        )}
      </View>
    );
  },
);

import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import Entypo from "@expo/vector-icons/Entypo";

const HomeScreen = () => {
  const [isDbReady, setIsDbReady] = useState(false);
  const mountedRef = useRef(true);
  const [refreshing, setRefreshing] = useState(false);
  const [network, setNetwork] = useState({ isConnected: null });
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [description, setDescription] = useState("");
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placeholderText, setPlaceholderText] = useState("Product Id");
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [db, setDb] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editedData, setEditedData] = useState({
    name: "",
    role: "",
    description: "",
  });
  const [place2, setPlace2] = useState("");
  const [adminemail, setAdminemail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(new Date());
  const [appState, setAppState] = useState(AppState.currentState);
  const [syncCount, setSyncCount] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [highlightedProductId, setHighlightedProductId] = useState(null);

  const BACKEND_URL = "https://darklick.com";
  const scrollViewRef = useRef(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const fastRefreshIntervalRef = useRef(null);
  const backgroundIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const visibilityIntervalRef = useRef(null);
  const [mainScrollY, setMainScrollY] = useState(0);
  const [mainContentHeight, setMainContentHeight] = useState(0);
  const [mainScrollViewHeight, setMainScrollViewHeight] = useState(
    height - 300,
  );
  const isInitializingDB = useRef(false);
  const isFetchingRef = useRef(false);
  const dbRef = useRef(null);

  // ─── Google Auth ─────────────────────────────────────────────────────────────
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: __DEV__
      ? "1455597817-igff7e1mvruckv5buhii510bfn0mgro3.apps.googleusercontent.com"
      : "1455597817-u78pel5o1htvn3dtkh8e1crviufboi4k.apps.googleusercontent.com", // ← paste production client ID here
    webClientId:
      "1455597817-icmm1q6c810pv66fa0tmhpfb8og3lmnp.apps.googleusercontent.com",
    scopes: ["profile", "email"],
    redirectUri:
      Platform.OS === "web"
        ? "http://localhost:8081"
        : "com.darklick.yourapp:/oauthredirect",
  });

  // ─── Load saved user ──────────────────────────────────────────────────────────
  useEffect(() => {
    const loadSavedUser = async () => {
      try {
        const savedUserJson = await AsyncStorage.getItem(USER_STORAGE_KEY);
        if (savedUserJson) {
          const savedUser = JSON.parse(savedUserJson);
          setUser(savedUser);
          console.log("Restored saved user:", savedUser.email);
        }
      } catch (error) {
        console.error("Failed to load saved user:", error);
      }
    };
    loadSavedUser();
  }, []);

  useEffect(() => {
    if (response?.type === "success") {
      fetchGoogleUserInfo(response.authentication.accessToken);
    }
  }, [response]);

  const fetchGoogleUserInfo = useCallback(async (accessToken) => {
    try {
      const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userInfo = await res.json();
      const userData = {
        email: userInfo.email,
        photo: userInfo.picture,
        name: userInfo.name,
        accessToken,
      };
      setUser(userData);
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      console.log("User signed in and saved:", userInfo.email);
    } catch (error) {
      console.error("Failed to fetch Google user info:", error);
    }
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      const result = await promptAsync();
      if (result?.type === "success") {
        const res = await fetch("https://www.googleapis.com/userinfo/v2/me", {
          headers: {
            Authorization: `Bearer ${result.authentication.accessToken}`,
          },
        });
        const userInfo = await res.json();
        const userData = {
          email: userInfo.email,
          photo: userInfo.picture,
          name: userInfo.name,
          accessToken: result.authentication.accessToken,
        };
        setUser(userData);
        await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
        return userData;
      }
      return null;
    } catch (error) {
      console.error("Google Sign-in error:", error);
      return null;
    }
  }, [promptAsync]);

  const syncFromServer = useCallback(
    async (database) => {
      if (!database) return;
      try {
        const response = await fetchWithTimeout(
          `${BACKEND_URL}/api/listproducts`,
          {},
          20000,
        );
        if (response.ok) {
          const allProducts = await response.json();
          if (!database) return;
          await database.runAsync(
            `DELETE FROM products WHERE isPending = 0 OR isPending IS NULL`,
          );
          for (let i = 0; i < allProducts.length; i++) {
            const p = allProducts[i];
            const id =
              typeof p._id === "object" && p._id.$oid ? p._id.$oid : p._id;
            if (!database) break;
            await database.runAsync(
              `INSERT OR IGNORE INTO products (_id, name, role, description, email, isPending, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              id,
              p.name,
              p.role || "",
              p.description || "",
              p.email || "",
              0,
              i,
            );
          }
          console.log(`Synced ${allProducts.length} products from server`);
        }
      } catch (error) {
        console.error("Server sync error:", error);
      }
    },
    [BACKEND_URL],
  );

  const loadProductsFromDB = useCallback(async (database) => {
    if (!database) return;
    try {
      const results = await database.getAllAsync(`
        SELECT * FROM products 
        ORDER BY 
        CASE WHEN isPending = 1 THEN 0 ELSE 1 END, 
        CASE WHEN isPending = 0 OR isPending IS NULL THEN sort_order ELSE rowid END ASC
      `);
      setProducts(
        results.map((p) => ({ ...p, isPending: Boolean(p.isPending) })),
      );
    } catch (e) {
      console.error("Error loading products:", e);
    }
  }, []);

  const initializeDB = useCallback(async () => {
    if (isInitializingDB.current) return dbRef.current;
    if (dbRef.current && isDbReady) return dbRef.current;
    isInitializingDB.current = true;
    try {
      const database = await SQLite.openDatabaseAsync("products.db");
      if (!mountedRef.current) return null;
      dbRef.current = database;
      setDb(database);
      await database.execAsync(
        `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`,
      );
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS products (
          _id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, role TEXT,
          description TEXT, email TEXT, isPending INTEGER DEFAULT 0,
          sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_queue (
          tempId TEXT PRIMARY KEY NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL,
          productId TEXT, timestamp INTEGER NOT NULL
        );
      `);
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS placeholders (
          id INTEGER PRIMARY KEY NOT NULL, productIdPlaceholder TEXT,
          rolePlaceholder TEXT, descPlaceholder TEXT, adminEmail TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const placeholderCount = await database.getFirstAsync(
        "SELECT COUNT(*) as count FROM placeholders",
      );
      if (placeholderCount?.count === 0) {
        await database.runAsync(
          `INSERT INTO placeholders (id, productIdPlaceholder, rolePlaceholder, descPlaceholder, adminEmail) VALUES (?, ?, ?, ?, ?)`,
          1,
          "Product Id",
          "Your role in transport ?",
          "Transport description",
          "",
        );
      }
      try {
        const tableInfo = await database.getAllAsync(
          `PRAGMA table_info(products)`,
        );
        if (!tableInfo.some((c) => c.name === "isPending"))
          await database.execAsync(
            `ALTER TABLE products ADD COLUMN isPending INTEGER DEFAULT 0;`,
          );
        if (!tableInfo.some((c) => c.name === "sort_order"))
          await database.execAsync(
            `ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0;`,
          );
      } catch (error) {
        console.warn("Column migration check:", error.message);
      }
      if (network.isConnected && mountedRef.current)
        await syncFromServer(database);
      if (mountedRef.current) await loadProductsFromDB(database);
      setIsDbReady(true);
      return database;
    } catch (error) {
      console.error("Database initialization failed:", error);
      dbRef.current = null;
      setDb(null);
      setIsDbReady(false);
      return null;
    } finally {
      isInitializingDB.current = false;
    }
  }, [network.isConnected, syncFromServer, loadProductsFromDB, isDbReady]);

  // ✅ FIX 2 & 3: Smart fetch with change detection
  const fetchDataFromServer = useCallback(async () => {
    if (!network.isConnected) return;
    if (!dbRef.current || !isDbReady) return;
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    const currentDb = dbRef.current;

    try {
      const response = await fetchWithTimeout(
        `${BACKEND_URL}/api/listproducts`,
        {
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        },
        15000,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const serverData = await response.json();
      if (!currentDb || !mountedRef.current || !isDbReady) return;

      // ✅ Smart change detection — skip DB write if nothing changed
      const currentProducts = await currentDb.getAllAsync(
        "SELECT _id FROM products WHERE isPending = 0 ORDER BY sort_order ASC",
      );
      const currentIds = currentProducts.map((p) => p._id).join(",");
      const serverIds = serverData
        .map((p) =>
          typeof p._id === "object" && p._id.$oid ? p._id.$oid : p._id,
        )
        .join(",");

      if (currentIds === serverIds) return; // ✅ No change, skip

      await currentDb.runAsync(
        `DELETE FROM products WHERE isPending = 0 OR isPending IS NULL`,
      );
      for (let i = 0; i < serverData.length; i++) {
        if (!currentDb || !mountedRef.current) break;
        const product = serverData[i];
        const id =
          typeof product._id === "object" && product._id.$oid
            ? product._id.$oid
            : product._id;
        await currentDb.runAsync(
          `INSERT OR REPLACE INTO products (_id, name, role, description, email, isPending, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          product.name,
          product.role || "",
          product.description || "",
          product.email || "",
          0,
          i,
        );
      }
      if (currentDb && mountedRef.current) {
        await loadProductsFromDB(currentDb);
        setLastFetchTime(new Date());
      }
    } catch (error) {
      console.error("Fetch error:", error.message || error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [network.isConnected, BACKEND_URL, loadProductsFromDB, isDbReady]);

  const addToOfflineQueue = useCallback(async (action, data, id) => {
    if (!dbRef.current) return null;
    try {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await dbRef.current.runAsync(
        `INSERT INTO offline_queue (tempId, action, data, productId, timestamp) VALUES (?, ?, ?, ?, ?)`,
        tempId,
        action,
        JSON.stringify(data),
        id || "",
        Date.now(),
      );
      return tempId;
    } catch (error) {
      console.error("Failed to add to offline queue:", error);
      return null;
    }
  }, []);

  const syncOfflineData = useCallback(async () => {
    if (!network.isConnected || !dbRef.current) return;
    try {
      const offlineItems = await dbRef.current.getAllAsync(
        "SELECT * FROM offline_queue ORDER BY timestamp ASC",
      );
      if (offlineItems.length === 0) return;
      for (const item of offlineItems) {
        try {
          const itemData = JSON.parse(item.data);
          if (item.action === "add") {
            const response = await axios.post(
              `${BACKEND_URL}/api/products`,
              itemData,
            );
            if (response.status === 200 || response.status === 201) {
              const serverProduct = response.data;
              const serverId =
                typeof serverProduct._id === "object" && serverProduct._id.$oid
                  ? serverProduct._id.$oid
                  : serverProduct._id;
              await dbRef.current.runAsync(
                `DELETE FROM products WHERE _id = ?`,
                item.tempId,
              );
              await dbRef.current.runAsync(
                `INSERT INTO products (_id, name, role, description, email, isPending) VALUES (?, ?, ?, ?, ?, ?)`,
                serverId,
                serverProduct.name,
                serverProduct.role || "",
                serverProduct.description || "",
                serverProduct.email || "",
                0,
              );
            }
          } else if (item.action === "edit") {
            const response = await axios.put(
              `${BACKEND_URL}/api/products/${item.productId}`,
              itemData,
            );
            if (response.status === 200)
              await dbRef.current.runAsync(
                `UPDATE products SET isPending = 0 WHERE _id = ?`,
                item.productId,
              );
          } else if (item.action === "delete") {
            // ✅ FIX 1: Handle delete sync
            await axios.delete(`${BACKEND_URL}/api/products/${item.productId}`);
          }
          await dbRef.current.runAsync(
            "DELETE FROM offline_queue WHERE tempId = ?",
            item.tempId,
          );
        } catch (error) {
          console.error("Failed to sync item:", item.tempId, error);
        }
      }
      await loadProductsFromDB(dbRef.current);
    } catch (error) {
      console.error("Offline sync error:", error);
    }
  }, [network.isConnected, BACKEND_URL, loadProductsFromDB]);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Font.loadAsync({
          [FONT_REGULAR]: require("./assets/fonts/HelveticaNeueMedium.otf"),
          [FONT_BOLD]: require("./assets/fonts/HelveticaNeueMedium.otf"),
        });
        setFontsLoaded(true);
      } catch (error) {
        setFontsLoaded(true);
      }
    };
    loadFonts();
  }, []);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (appState.match(/inactive|background/) && nextAppState === "active") {
        if (network.isConnected && dbRef.current) {
          fetchDataFromServer();
          syncOfflineData();
        }
      }
      setAppState(nextAppState);
    };
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription?.remove();
  }, [appState, network.isConnected, fetchDataFromServer, syncOfflineData]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const wasOffline = network.isConnected === false;
      const isNowOnline = state.isConnected === true;
      setNetwork({ isConnected: state.isConnected });
      if (wasOffline && isNowOnline) {
        setTimeout(() => {
          if (dbRef.current) {
            syncOfflineData();
            fetchDataFromServer();
          }
        }, 1000);
      }
    });
    NetInfo.fetch().then((state) =>
      setNetwork({ isConnected: state.isConnected }),
    );
    return () => unsubscribe();
  }, [syncOfflineData, fetchDataFromServer]);

  // ✅ FIX 2 & 3: Single clean 2-second interval
  useEffect(() => {
    if (!network.isConnected || !isDbReady) {
      [
        fastRefreshIntervalRef,
        backgroundIntervalRef,
        heartbeatIntervalRef,
        visibilityIntervalRef,
      ].forEach((ref) => {
        if (ref.current) {
          clearInterval(ref.current);
          ref.current = null;
        }
      });
      return;
    }

    // ✅ Single clean interval — 2 seconds
    fastRefreshIntervalRef.current = setInterval(() => {
      if (
        network.isConnected &&
        dbRef.current &&
        isDbReady &&
        !isFetchingRef.current &&
        appState === "active"
      ) {
        fetchDataFromServer();
      }
    }, 2000);

    return () => {
      if (fastRefreshIntervalRef.current) {
        clearInterval(fastRefreshIntervalRef.current);
        fastRefreshIntervalRef.current = null;
      }
    };
  }, [network.isConnected, isDbReady, appState, fetchDataFromServer]);

  useEffect(() => {
    mountedRef.current = true;
    initializeDB();
    return () => {
      mountedRef.current = false;
      [
        fastRefreshIntervalRef,
        backgroundIntervalRef,
        heartbeatIntervalRef,
        visibilityIntervalRef,
      ].forEach((ref) => {
        if (ref.current) {
          clearInterval(ref.current);
          ref.current = null;
        }
      });
    };
  }, []);

  const GetPlace2 = useCallback(async () => {
    if (!network.isConnected) {
      if (dbRef.current) {
        try {
          const result = await dbRef.current.getFirstAsync(
            "SELECT descPlaceholder FROM placeholders WHERE id = 1",
          );
          setPlace2(result?.descPlaceholder || "Transport description");
        } catch (error) {
          console.error("Error fetching cached descPlaceholder:", error);
        }
      }
      return;
    }
    try {
      const response = await fetchWithTimeout(
        "https://darklick.com/api/descplace",
        {},
        8000,
      );
      if (response.ok) {
        const data = await response.json();
        const descText = data[0]?.desc || "Transport description";
        setPlace2(descText);
        if (dbRef.current)
          await dbRef.current.runAsync(
            `UPDATE placeholders SET descPlaceholder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
            descText,
          );
      }
    } catch (error) {
      if (dbRef.current) {
        const result = await dbRef.current.getFirstAsync(
          "SELECT descPlaceholder FROM placeholders WHERE id = 1",
        );
        setPlace2(result?.descPlaceholder || "Transport description");
      }
    }
  }, [network.isConnected]);

  const GetAdminEmail = useCallback(async () => {
    if (!network.isConnected) {
      if (dbRef.current) {
        try {
          const result = await dbRef.current.getFirstAsync(
            "SELECT adminEmail FROM placeholders WHERE id = 1",
          );
          setAdminemail(result?.adminEmail || "");
        } catch (error) {
          console.error("Error fetching cached adminEmail:", error);
        }
      }
      return;
    }
    try {
      const response = await fetchWithTimeout(
        "https://darklick.com/api/admin-email",
        {},
        8000,
      );
      if (response.ok) {
        const data = await response.json();
        const emailText = data[0]?.email ?? "";
        setAdminemail(emailText);
        if (dbRef.current)
          await dbRef.current.runAsync(
            `UPDATE placeholders SET adminEmail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
            emailText,
          );
      }
    } catch (error) {
      if (dbRef.current) {
        const result = await dbRef.current.getFirstAsync(
          "SELECT adminEmail FROM placeholders WHERE id = 1",
        );
        setAdminemail(result?.adminEmail || "");
      }
    }
  }, [network.isConnected]);

  useEffect(() => {
    if (db) {
      const timer = setTimeout(() => {
        Promise.all([GetPlace2(), GetAdminEmail()]);
      }, 500);
      if (network.isConnected)
        setTimeout(() => {
          Promise.all([GetPlace2(), GetAdminEmail()]);
        }, 1000);
      return () => clearTimeout(timer);
    }
  }, [network.isConnected, db, GetPlace2, GetAdminEmail]);

  useEffect(() => {
    const fetchPlaceholderText = async () => {
      if (!network.isConnected) {
        if (dbRef.current) {
          try {
            const result = await dbRef.current.getFirstAsync(
              "SELECT productIdPlaceholder FROM placeholders WHERE id = 1",
            );
            setPlaceholderText(result?.productIdPlaceholder || "Product Id");
          } catch (error) {
            console.error("Error:", error);
          }
        }
        return;
      }
      try {
        const response = await fetchWithTimeout(
          "https://darklick.com/api/placeholder",
          {},
          8000,
        );
        if (response.ok) {
          const data = await response.json();
          const placeholderValue = data.placeholderText || "ProductId";
          setPlaceholderText(placeholderValue);
          if (dbRef.current)
            await dbRef.current.runAsync(
              `UPDATE placeholders SET productIdPlaceholder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
              placeholderValue,
            );
        }
      } catch (error) {
        if (dbRef.current) {
          const result = await dbRef.current.getFirstAsync(
            "SELECT productIdPlaceholder FROM placeholders WHERE id = 1",
          );
          setPlaceholderText(result?.productIdPlaceholder || "Product Id");
        }
      }
    };
    if (db) setTimeout(() => fetchPlaceholderText(), 500);
  }, [network.isConnected, db]);

  useEffect(() => {
    const getQueueCount = async () => {
      if (dbRef.current) {
        try {
          const result = await dbRef.current.getFirstAsync(
            "SELECT COUNT(*) as count FROM offline_queue",
          );
          setQueueCount(result?.count || 0);
        } catch (e) {}
      }
    };
    const interval = setInterval(getQueueCount, 2000);
    getQueueCount();
    return () => clearInterval(interval);
  }, [db]);

  const addProductToBackend = useCallback(async () => {
    if (!query.trim() || isSubmitting) return;
    setIsSubmitting(true);
    let user1 = user;
    if (!user1?.email) {
      user1 = await handleLogin();
      if (!user1?.email) {
        setIsSubmitting(false);
        return;
      }
    }
    const productData = {
      name: query.trim(),
      role: "",
      description: description.trim(),
      email: user1.email,
    };
    if (!network.isConnected) {
      const tempId = await addToOfflineQueue("add", productData);
      if (tempId && dbRef.current) {
        await dbRef.current.runAsync(
          `INSERT INTO products (_id, name, role, description, email, isPending) VALUES (?, ?, ?, ?, ?, ?)`,
          tempId,
          productData.name,
          productData.role,
          productData.description,
          productData.email,
          1,
        );
        await loadProductsFromDB(dbRef.current);
      }
    } else {
      try {
        const response = await axios.post(
          `${BACKEND_URL}/api/products`,
          productData,
        );
        if (response.status === 200 || response.status === 201)
          await fetchDataFromServer();
      } catch (err) {
        console.error("Add product error:", err);
        setIsSubmitting(false);
        return;
      }
    }
    setQuery("");
    setDescription("");
    setIsSubmitting(false);
  }, [
    query,
    description,
    user,
    network.isConnected,
    isSubmitting,
    addToOfflineQueue,
    loadProductsFromDB,
    handleLogin,
    fetchDataFromServer,
    BACKEND_URL,
  ]);

  // ✅ FIX 1: Delete product
  const deleteProduct = useCallback(
    async (productId) => {
      Alert.alert("Delete", "Are you sure you want to delete this?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!network.isConnected) {
              // Offline: queue delete
              await addToOfflineQueue("delete", {}, productId);
              if (dbRef.current) {
                await dbRef.current.runAsync(
                  `DELETE FROM products WHERE _id = ?`,
                  productId,
                );
                await loadProductsFromDB(dbRef.current);
              }
              return;
            }
            try {
              await axios.delete(`${BACKEND_URL}/api/products/${productId}`);
              if (dbRef.current) {
                await dbRef.current.runAsync(
                  `DELETE FROM products WHERE _id = ?`,
                  productId,
                );
                await loadProductsFromDB(dbRef.current);
              }
            } catch (e) {
              console.error("Delete error:", e);
              Alert.alert("Error", "Failed to delete. Please try again.");
            }
          },
        },
      ]);
    },
    [network.isConnected, addToOfflineQueue, loadProductsFromDB, BACKEND_URL],
  );

  const onUpdate = useCallback(
    async (updatedProduct) => {
      const editData = {
        name: updatedProduct.name,
        role: updatedProduct.role,
        description: updatedProduct.description,
      };
      if (!network.isConnected) {
        await addToOfflineQueue("edit", editData, updatedProduct._id);
        if (dbRef.current) {
          await dbRef.current.runAsync(
            `UPDATE products SET name = ?, role = ?, description = ?, isPending = ? WHERE _id = ?`,
            updatedProduct.name,
            updatedProduct.role,
            updatedProduct.description,
            1,
            updatedProduct._id,
          );
          await loadProductsFromDB(dbRef.current);
        }
        return;
      }
      try {
        const response = await axios.put(
          `${BACKEND_URL}/api/products/${updatedProduct._id}`,
          editData,
        );
        if (response.status === 200) {
          if (dbRef.current) {
            await dbRef.current.runAsync(
              `UPDATE products SET name = ?, role = ?, description = ?, isPending = ? WHERE _id = ?`,
              updatedProduct.name,
              updatedProduct.role,
              updatedProduct.description,
              0,
              updatedProduct._id,
            );
            await loadProductsFromDB(dbRef.current);
          }
          setTimeout(() => fetchDataFromServer(), 500);
        }
      } catch (e) {
        console.error("Update product error:", e);
      }
    },
    [
      network.isConnected,
      addToOfflineQueue,
      loadProductsFromDB,
      fetchDataFromServer,
      BACKEND_URL,
    ],
  );

  const startEdit = useCallback((product) => {
    setEditingId(product._id);
    setEditedData({
      name: product.name,
      role: product.role || "",
      description: product.description || "",
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingId) return;
    const updatedProduct = {
      _id: editingId,
      ...editedData,
      email: products.find((p) => p._id === editingId)?.email,
    };
    await onUpdate(updatedProduct);
    setEditingId(null);
    setEditedData({ name: "", role: "", description: "" });
  }, [editingId, editedData, onUpdate, products]);

  const toggleEmail = useCallback(() => setShowEmail((prev) => !prev), []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setQuery("");
    if (network.isConnected && dbRef.current) {
      await Promise.all([
        fetchDataFromServer(),
        syncOfflineData(),
        GetPlace2(),
        GetAdminEmail(),
      ]);
    } else {
      await initializeDB();
    }
    setRefreshing(false);
  }, [
    network.isConnected,
    fetchDataFromServer,
    syncOfflineData,
    GetPlace2,
    GetAdminEmail,
    initializeDB,
  ]);

  const handleQueryChange = (text) => setQuery(text);

  const handleProductNamePress = useCallback(
    (product) => {
      if (highlightedProductId === product._id) {
        setQuery(product.name);
        setHighlightedProductId(null);
      } else {
        setHighlightedProductId(product._id);
      }
    },
    [highlightedProductId],
  );

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        (p.name?.toLowerCase() ?? "").includes(query.toLowerCase()) ||
        (p.role?.toLowerCase() ?? "").includes(query.toLowerCase()) ||
        (p.description?.toLowerCase() ?? "").includes(query.toLowerCase()),
    );
  }, [products, query]);

  const [isDraggingMainScrollbar, setIsDraggingMainScrollbar] = useState(false);

  const handleMainScrollbarDrag = useCallback(
    (event) => {
      if (!isDraggingMainScrollbar) return;
      const { pageY } = event.nativeEvent;
      const trackTop = Constants.statusBarHeight + 250;
      const trackHeight = mainScrollViewHeight - 330;
      const scrollbarHeight = Math.max(
        (mainScrollViewHeight / mainContentHeight) * mainScrollViewHeight,
        40,
      );
      const maxScrollbarPosition = trackHeight - scrollbarHeight;
      const relativeY = pageY - trackTop;
      const clampedY = Math.max(0, Math.min(maxScrollbarPosition, relativeY));
      const scrollRatio = clampedY / maxScrollbarPosition;
      const maxScrollOffset = mainContentHeight - mainScrollViewHeight;
      scrollViewRef.current?.scrollTo({
        y: scrollRatio * maxScrollOffset,
        animated: false,
      });
    },
    [isDraggingMainScrollbar, mainScrollViewHeight, mainContentHeight],
  );

  return (
    <View style={{ flex: 1 }}>
      <TouchableWithoutFeedback
        onPress={() => {
          setShowEmail(false);
          setHighlightedProductId(null);
          Keyboard.dismiss();
        }}
      >
        <ScrollView
          ref={scrollViewRef}
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#888"
              enabled={scrollEnabled}
            />
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 50 }}
          keyboardShouldPersistTaps="handled"
          onTouchStart={() => {
            setShowEmail(false);
            Keyboard.dismiss();
          }}
          onScroll={(e) => setMainScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          onContentSizeChange={(width, height) => setMainContentHeight(height)}
          onLayout={(e) => setMainScrollViewHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.container}>
            <View style={styles.topContainer}>
              <View style={styles.leftNavigation}>
                <TouchableOpacity
                  onPress={toggleEmail}
                  style={styles.iconButton}
                >
                  <Entypo name="info" size={22} color="#888" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    initializeDB();
                    setQuery("");
                  }}
                  style={styles.iconButton}
                >
                  <MaterialIcons name="home" size={28} color="#888" />
                </TouchableOpacity>
              </View>
              <View style={styles.rightSection}>
                {user?.photo && (
                  <Image
                    source={{ uri: user.photo }}
                    style={styles.profileImageInline}
                    resizeMode="cover"
                  />
                )}
              </View>
            </View>

            <View style={styles.centerSection}>
              {placeholderText && (
                <CustomCenteredInput
                  value={query}
                  onChangeText={handleQueryChange}
                  placeholder={placeholderText}
                  placeholderTextColor="#ddd7d7ff"
                  style={styles.searchInputInline}
                  keyboardType="numeric"
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              )}
            </View>

            {showEmail && (
              <View style={styles.emailTooltipInline}>
                <Text style={styles.emailText}>{adminemail}</Text>
              </View>
            )}

            <View>
              {place2 && query && (
                <ScrollableTextArea
                  value={description}
                  onChangeText={setDescription}
                  placeholder={place2}
                  placeholderTextColor="#666"
                  maxLength={500}
                  onScrollEnabledChange={setScrollEnabled}
                />
              )}
              {place2 && query && (
                <TouchableOpacity
                  onPress={addProductToBackend}
                  style={[
                    styles.submitButton,
                    isSubmitting && styles.submitButtonDisabled,
                  ]}
                  disabled={isSubmitting}
                >
                  <MaterialIcons
                    name="send"
                    size={24}
                    color={isSubmitting ? "#444" : "#888"}
                  />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.productsContainer}>
              {filteredProducts.map((product) => (
                <View
                  key={product._id}
                  style={[
                    styles.productCard,
                    { opacity: product.isPending ? 0.7 : 1 },
                  ]}
                >
                  {editingId === product._id ? (
                    <View style={styles.editForm}>
                      <CustomCenteredInput
                        value={editedData.name}
                        onChangeText={(text) =>
                          setEditedData({ ...editedData, name: text })
                        }
                        placeholder="Name"
                        placeholderTextColor="#666"
                        style={styles.editInput}
                        keyboardType="numeric"
                        inputType="numeric"
                        maxLength={50}
                        returnKeyType="next"
                        autoCorrect={false}
                        autoCapitalize="none"
                      />
                      <ScrollableTextArea
                        value={editedData.description}
                        onChangeText={(text) =>
                          setEditedData({ ...editedData, description: text })
                        }
                        placeholder="Description"
                        placeholderTextColor="#666"
                        maxLength={500}
                        onScrollEnabledChange={setScrollEnabled}
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          onPress={handleSave}
                          style={styles.actionButton}
                        >
                          <MaterialIcons name="save" size={20} color="#888" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEditingId(null)}
                          style={styles.actionButton}
                        >
                          <MaterialIcons name="cancel" size={20} color="#888" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.productDisplay}>
                      <TouchableOpacity
                        onPress={() => handleProductNamePress(product)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.productName,
                            highlightedProductId === product._id &&
                              styles.productNameHighlighted,
                          ]}
                          selectable={true}
                        >
                          {product.name}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.productRole} selectable={true}>
                        {product.role || ""}
                      </Text>
                      <View style={styles.productHeader}>
                        <Text
                          style={styles.productDescription}
                          numberOfLines={0}
                          selectable={true}
                        >
                          {product.description || "No description provided"}
                        </Text>
                        {product.email === user?.email && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => startEdit(product)}
                              style={{ padding: 8 }}
                            >
                              <MaterialIcons
                                name="edit"
                                size={18}
                                color="#888"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => deleteProduct(product._id)}
                              style={{ padding: 8 }}
                            >
                              <MaterialIcons
                                name="delete"
                                size={18}
                                color="#ff6b6b"
                              />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                  <LinearGradient
                    colors={["transparent", "gray", "transparent"]}
                    style={styles.separator}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                  />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>

      {mainContentHeight > mainScrollViewHeight && (
        <View
          style={styles.mainScrollbarTrack}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => setIsDraggingMainScrollbar(true)}
          onResponderMove={handleMainScrollbarDrag}
          onResponderRelease={() => setIsDraggingMainScrollbar(false)}
        >
          <View
            style={[
              styles.mainScrollbarThumb,
              {
                height: Math.max(
                  (mainScrollViewHeight / mainContentHeight) *
                    mainScrollViewHeight -
                    250,
                  40,
                ),
                transform: [
                  {
                    translateY: Math.max(
                      0,
                      Math.min(
                        (mainScrollY /
                          (mainContentHeight - mainScrollViewHeight)) *
                          (mainScrollViewHeight -
                            Math.max(
                              (mainScrollViewHeight / mainContentHeight) *
                                mainScrollViewHeight,
                              40,
                            ) -
                            300),
                        mainScrollViewHeight -
                          Math.max(
                            (mainScrollViewHeight / mainContentHeight) *
                              mainScrollViewHeight,
                            40,
                          ) -
                          300,
                      ),
                    ),
                  },
                ],
              },
            ]}
          />
        </View>
      )}
    </View>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    minHeight: height,
    paddingTop: Constants.statusBarHeight,
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  mainScrollbarTrack: {
    position: "absolute",
    right: 20,
    top: Constants.statusBarHeight + 200,
    bottom: 70,
    width: 6,
    backgroundColor: "#1a1a1a",
    borderRadius: 3,
    zIndex: 100,
  },
  mainScrollbarThumb: {
    width: 16,
    marginLeft: -5,
    backgroundColor: "#555",
    borderRadius: 3,
    position: "absolute",
    top: 0,
  },
  topNavigation: {
    position: "absolute",
    top: Constants.statusBarHeight + 0,
    left: 20,
    flexDirection: "row",
    zIndex: 10,
  },
  formInput: {
    height: 40,
    backgroundColor: "transparent",
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 10,
    fontFamily: FONT_REGULAR,
  },
  multilineInput: {
    height: 150,
    textAlignVertical: "top",
    paddingTop: 15,
    width: 50,
    paddingBottom: 15,
    paddingRight: 10,
  },
  submitButton: {
    alignSelf: "center",
    padding: 0,
    backgroundColor: "transparent",
  },
  submitButtonDisabled: { opacity: 0.5 },
  productsContainer: {
    marginTop: 20,
    marginLeft: 10,
    marginRight: 10,
    flex: 1,
  },
  productCard: { marginBottom: 20, position: "relative" },
  editForm: { backgroundColor: "transparent", padding: 15 },
  editInput: {
    backgroundColor: "#000",
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 10,
    fontFamily: FONT_REGULAR,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
  },
  actionButton: { marginHorizontal: 15, padding: 10 },
  separator: { height: 1.5, marginTop: 8, borderRadius: 1 },
  customInputContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  displayInput: { alignItems: "center", position: "relative" },
  customInputText: {
    fontSize: 16,
    textAlign: "center",
    color: "#888",
    fontFamily: FONT_REGULAR,
  },
  customPlaceholder: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    fontFamily: FONT_REGULAR,
  },
  placeholderContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  centerCursorContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  cursor: { color: "#888", fontWeight: "900", fontSize: 20, lineHeight: 20 },
  hiddenInput: {
    position: "absolute",
    left: -1000,
    top: -1000,
    opacity: 0,
    height: 1,
    width: 1,
  },
  topContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Constants.statusBarHeight,
    paddingBottom: 10,
    zIndex: 10,
  },
  leftNavigation: { flexDirection: "row", alignItems: "center", flex: 1 },
  centerSection: {
    marginLeft: "0%",
    marginTop: 20,
    width: "100%",
    paddingHorizontal: 0,
  },
  rightSection: { flex: 1, alignItems: "flex-end" },
  iconButton: { marginRight: 2, padding: 5 },
  searchInputInline: {
    width: "100%",
    height: 40,
    backgroundColor: "transparent",
  },
  profileImageInline: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    borderWidth: 2,
    borderColor: "#333",
  },
  emailTooltipInline: {
    position: "absolute",
    top: Constants.statusBarHeight + 65,
    left: 0,
    color: "#fff",
    borderRadius: 4,
    zIndex: 20,
  },
  emailText: {
    zIndex: 1,
    marginLeft: -15,
    color: "#555",
    fontSize: 16,
    fontFamily: FONT_REGULAR,
  },
  productDisplay: { paddingVertical: 5, position: "relative" },
  productHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  productName: {
    color: "#e4d8d8ff",
    fontSize: 16,
    fontFamily: FONT_BOLD,
    fontWeight: "bold",
    flex: 1,
    marginRight: 10,
  },
  productNameHighlighted: {
    textDecorationLine: "underline",
    textDecorationColor: "rgba(255,255,255,0.4)",
    color: "#ffffff",
  },
  editButton: { padding: 5, right: 10, marginTop: "auto" },
  productRole: {
    color: "#e4ded5ff",
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    marginBottom: -22,
  },
  productDescription: {
    color: "#cfc2c2ff",
    fontSize: 16,
    marginTop: 15,
    fontStyle: "italic",
    fontFamily: FONT_REGULAR,
    lineHeight: 20,
    width: `90%`,
  },
  simpleScrollContainer: {
    height: 130,
    borderWidth: 1,
    borderRadius: 4,
    marginVertical: 5,
    backgroundColor: "#000",
    position: "relative",
  },
  simpleScrollInput: {
    flex: 1,
    backgroundColor: "transparent",
    color: "#888",
    fontSize: 16,
    fontStyle: "italic",
    textAlign: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingRight: 25,
    fontFamily: FONT_REGULAR,
  },
  customScrollbarTrack: {
    position: "absolute",
    right: 4,
    top: 4,
    bottom: 4,
    width: 6,
    backgroundColor: "#1a1a1a",
    borderRadius: 3,
  },
  customScrollbarThumb: {
    width: 6,
    backgroundColor: "#555",
    borderRadius: 3,
    position: "absolute",
    top: 0,
  },
});
