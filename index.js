/**
 * Entry: landing (profile setup), config setup (chains + RPC), and transition to terminal.
 * Uses dkey-lib (script tag) and @wagmi/core + viem for chain config.
 */

(function () {
  var DkeyUserProfile = null;
  var config = {}; // minimal wagmi config placeholder for profile load

  var wagmi = require("@wagmi/core");
  var wagmiConnectors = require("@wagmi/connectors");
  var viemChains = require("viem/chains");
  var viem = require("viem");
  var LOCAL_ARBITRUM_RPC = "http://127.0.0.1:8547";
  var WALLETCONNECT_PROJECT_ID = "9e69964b5d8692b0560a1f04fc2c90e0";
  var CHAIN_IDS = { arbitrum: 42161, base: 8453 };
  var CHAIN_NAMES = { 42161: "Arbitrum", 8453: "Base" };
  function getChainName(chainId) {
    return CHAIN_NAMES[String(chainId)] || CHAIN_NAMES[Number(chainId)] || String(chainId);
  }

  function truncateAddress(addr) {
    if (!addr || typeof addr !== "string") return "";
    var s = addr.trim();
    if (s.length <= 12) return s;
    return s.slice(0, 6) + "\u2026" + s.slice(-4);
  }
  var DEFAULT_RPCS = {
    42161: "https://arb1.arbitrum.io/rpc",
    8453: "https://mainnet.base.org",
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function show(el) {
    if (el) el.classList.remove("hidden");
  }
  function hide(el) {
    if (el) el.classList.add("hidden");
  }
  function showError(id, msg) {
    var el = getEl(id);
    if (el) {
      el.textContent = msg || "";
      el.classList.toggle("hidden", !msg);
    }
  }

  var __configCache = { key: null, config: null };

  function buildConfigFromPrefs(prefs) {
    var rpcUrls = prefs.rpcUrls || {};
    var defaultChainId = prefs.defaultChainId != null ? Number(prefs.defaultChainId) : null;
    var chainIds = prefs.chainIds || (defaultChainId != null ? [defaultChainId] : []);
    if (defaultChainId != null && chainIds.indexOf(defaultChainId) < 0) chainIds = [defaultChainId];
    if (chainIds.length === 0) chainIds = [CHAIN_IDS.arbitrum];
    var cacheKey = JSON.stringify({
      defaultChainId: defaultChainId,
      rpc42161: rpcUrls[CHAIN_IDS.arbitrum] || DEFAULT_RPCS[42161],
      rpc8453: rpcUrls[CHAIN_IDS.base] || DEFAULT_RPCS[8453],
    });
    if (__configCache.key === cacheKey && __configCache.config) return __configCache.config;
    var chains = [viemChains.arbitrum, viemChains.base];
    var transports = {};
    chains.forEach(function (c) {
      var url = rpcUrls[c.id] || DEFAULT_RPCS[c.id];
      if (url) transports[c.id] = wagmi.http(url);
    });
    var config = wagmi.createConfig({
      chains: chains,
      connectors: [wagmiConnectors.walletConnect({ projectId: WALLETCONNECT_PROJECT_ID })],
      transports: transports,
    });
    __configCache.key = cacheKey;
    __configCache.config = config;
    return config;
  }

  var WALLETCONNECT_IDB_NAME = "WALLET_CONNECT_V2_INDEXED_DB";

  function clearWalletConnectionStorage(config) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        var keys = [];
        for (var i = window.localStorage.length - 1; i >= 0; i--) {
          var key = window.localStorage.key(i);
          if (key && (key.indexOf("wc@2") === 0 || key.indexOf("wc:") === 0 || key === "wagmi.store" || key === "wagmi.recentConnectorId")) keys.push(key);
        }
        keys.forEach(function (k) { window.localStorage.removeItem(k); });
      }
      if (config && config.storage && config.storage.removeItem) {
        var s = config.storage;
        Promise.resolve(s.removeItem("store")).catch(function () {});
        Promise.resolve(s.removeItem("recentConnectorId")).catch(function () {});
      }
      if (typeof window !== "undefined" && window.indexedDB && window.indexedDB.deleteDatabase) {
        try {
          window.indexedDB.deleteDatabase(WALLETCONNECT_IDB_NAME);
        } catch (idbErr) {}
        if (window.indexedDB.databases) {
          window.indexedDB.databases().then(function (dbs) {
            (dbs || []).forEach(function (db) {
              if (db.name && (db.name.indexOf("WALLET_CONNECT") >= 0 || db.name.indexOf("walletconnect") >= 0 || db.name.indexOf("wc@") >= 0)) {
                try { window.indexedDB.deleteDatabase(db.name); } catch (e) {}
              }
            });
          }).catch(function () {});
        }
      }
    } catch (e) {}
  }

  function disconnectAndClearStorage(config) {
    var conn = wagmi.getAccount(config);
    var connector = conn && conn.connector;
    return Promise.resolve(connector ? wagmi.disconnect(config, { connector: connector }) : wagmi.disconnect(config))
      .catch(function () {})
      .then(function () {
        clearWalletConnectionStorage(config);
      });
  }

  function getDefaultChainId(profile) {
    var origin = getOrigin();
    var prefs = profile && profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].config;
    if (prefs && prefs.defaultChainId != null) return Number(prefs.defaultChainId);
    if (prefs && prefs.chainIds && prefs.chainIds.length) return prefs.chainIds[0];
    return CHAIN_IDS.arbitrum;
  }

  function setProfile(profile) {
    try {
      var json = profile.serialize();
      setStoredProfile( json);
      window.__dkeyProfile = profile;
      ensureConfigThenGoToTerminal(profile);
    } catch (e) {
      showError("landing-message", "Failed to save profile: " + (e && e.message));
    }
  }

  function checkForDKeysReceived(profile) {
    if (!profile || typeof profile.hasOpenBids !== "function" || !profile.hasOpenBids()) {
      return Promise.resolve(profile);
    }
    var chainIds = Object.keys(profile.myOpenBids || {});
    return chainIds.reduce(function (promise, chainIdStr) {
      var chainId = parseInt(chainIdStr, 10);
      return promise.then(function (prof) {
        return prof.checkIfDKeysReceived(chainId).then(function (res) {
          if (!res.success || !res.profile) return prof;
          var filled = res.profile.getArrayOfFilledBids(chainId);
          if (!filled || filled.length === 0) return res.profile;
          return filled.reduce(function (innerPromise, bid) {
            return innerPromise.then(function (currentProfile) {
              return currentProfile.fetchDkey(bid).then(function (fetchRes) {
                return fetchRes.success && fetchRes.profile ? fetchRes.profile : currentProfile;
              });
            });
          }, Promise.resolve(res.profile));
        });
      });
    }, Promise.resolve(profile));
  }

  function showProfileViewAndCheckDKeys() {
    show(getEl("profile-page"));
    show(getEl("terminal"));
    var profile = window.__dkeyProfile;
    if (!profile) return;
    checkForDKeysReceived(profile).then(function (updatedProfile) {
      var toShow = updatedProfile || profile;
      if (updatedProfile) {
        window.__dkeyProfile = updatedProfile;
        setStoredProfile(updatedProfile.serialize());
      }
      renderProfilePage(toShow);
      updateAppHeader(toShow, "profile");
    }).catch(function (err) {
      console.warn("checkForDKeysReceived failed:", err);
      renderProfilePage(profile);
      updateAppHeader(profile, "profile");
    });
  }

  function goToTerminal() {
    hide(getEl("storage-prompt"));
    hide(getEl("landing"));
    hide(getEl("config-setup"));
    hide(getEl("username-setup"));
    hide(getEl("listing-view"));
    hide(getEl("create-listing-view"));
    hide(getEl("view-file-view"));
    show(getEl("profile-page"));
    show(getEl("terminal"));
    show(getEl("terminal-wrap"));
    if (typeof window.terminalReady === "function") window.terminalReady();
    var profile = window.__dkeyProfile;
    var listingParams = getListingParams();
    if (profile) {
      checkForDKeysReceived(profile).then(function (updatedProfile) {
        if (updatedProfile) {
          window.__dkeyProfile = updatedProfile;
          setStoredProfile(updatedProfile.serialize());
          renderProfilePage(updatedProfile);
          updateAppHeader(updatedProfile, "profile");
        }
        if (listingParams && listingParams.cid) {
          if (window.history && window.history.replaceState) {
            var url = window.location.pathname || "/";
            if (window.location.hash) url += window.location.hash;
            window.history.replaceState(null, "", url);
          }
          showListingView(listingParams.cid, listingParams.chainId);
        }
      }).catch(function (err) {
        console.warn("checkForDKeysReceived failed:", err);
        if (profile) renderProfilePage(profile);
        if (profile) updateAppHeader(profile, "profile");
        if (listingParams && listingParams.cid) {
          if (window.history && window.history.replaceState) {
            var url = window.location.pathname || "/";
            if (window.location.hash) url += window.location.hash;
            window.history.replaceState(null, "", url);
          }
          showListingView(listingParams.cid, listingParams.chainId);
        }
      });
    } else {
      if (listingParams && listingParams.cid) {
        if (window.history && window.history.replaceState) {
          var url = window.location.pathname || "/";
          if (window.location.hash) url += window.location.hash;
          window.history.replaceState(null, "", url);
        }
        showListingView(listingParams.cid, listingParams.chainId);
      }
    }
  }

  function getOrigin() {
    return typeof window !== "undefined" && window.location ? window.location.origin : "";
  }

  function getListingParams() {
    if (typeof window === "undefined" || !window.location || !window.location.search) return null;
    var params = new URLSearchParams(window.location.search);
    var cid = params.get("listing");
    if (!cid || !cid.trim()) return null;
    cid = cid.trim();
    var chainId = params.get("chainId");
    if (chainId !== null && chainId !== "") chainId = chainId.trim(); else chainId = null;
    return { cid: cid, chainId: chainId };
  }

  function ensureConfigThenGoToTerminal(profile) {
    var origin = getOrigin();
    if (!origin) {
      goToTerminal();
      return;
    }
    var savedPrefs = profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].config;
    var hasValidPrefs = savedPrefs && savedPrefs.rpcUrls && (savedPrefs.defaultChainId != null || (savedPrefs.chainIds && savedPrefs.chainIds.length));
    if (hasValidPrefs) {
      try {
        var built = buildConfigFromPrefs(savedPrefs);
        var json = profile.serialize();
        var restored = DkeyUserProfile.deserialize(json, built);
        window.__dkeyProfile = restored;
        setStoredProfile( json);
        ensureUsernameThenWalletThenGoToTerminal(restored, built, getDefaultChainId(restored));
        return;
      } catch (e) {
        console.warn("Re-deserialize with saved config failed:", e);
      }
    }
    hide(getEl("landing"));
    show(getEl("config-setup"));
    showConfigSetup(profile);
  }

  var DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";

  function ensureAbsoluteGatewayUrl(url) {
    if (!url || typeof url !== "string") return url;
    var u = url.trim();
    if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
    return "https://" + u.replace(/^\/+/, "");
  }

  var RPC_OPTIONS = {
    42161: [
      { label: "arb1.arbitrum.io (default)", url: "https://arb1.arbitrum.io/rpc" },
      { label: "drpc.org", url: "https://arbitrum.drpc.org" },
      { label: "meowrpc.com", url: "https://arbitrum.meowrpc.com" },
      { label: "publicnode.com", url: "https://arbitrum-one-rpc.publicnode.com" },
    ],
    8453: [
      { label: "mainnet.base.org (default)", url: "https://mainnet.base.org" },
      { label: "drpc.org", url: "https://base.drpc.org" },
    ],
  };

  function showConfigSetup(profile) {
    var localPrompt = getEl("config-setup-local-prompt");
    var localMsg = localPrompt ? localPrompt.querySelector(".config-setup-local-msg") : null;
    showError("config-setup-error", "");

    var origin = getOrigin();
    var originInfo = profile.userInfo && profile.userInfo[origin];
    var savedPrefs = originInfo && originInfo.config;
    var defaultChainId = (savedPrefs && savedPrefs.defaultChainId != null) ? Number(savedPrefs.defaultChainId) : CHAIN_IDS.arbitrum;

    window.__configRpcUrls = window.__configRpcUrls || {};
    if (savedPrefs && savedPrefs.rpcUrls) {
      Object.keys(savedPrefs.rpcUrls).forEach(function (id) { window.__configRpcUrls[Number(id)] = savedPrefs.rpcUrls[id]; });
    }
    if (window.__configRpcUrls[CHAIN_IDS.arbitrum] == null) window.__configRpcUrls[CHAIN_IDS.arbitrum] = DEFAULT_RPCS[42161];
    if (window.__configRpcUrls[CHAIN_IDS.base] == null) window.__configRpcUrls[CHAIN_IDS.base] = DEFAULT_RPCS[8453];

    var chainSelect = getEl("config-default-chain");
    var rpcSelect = getEl("config-rpc-select");
    var addressEl = getEl("config-setup-address");
    var connectBtn = getEl("config-setup-connect-wallet");
    var gatewayEl = getEl("config-ipfs-gateway");
    var pinningEl = getEl("config-pinning-method");

    if (chainSelect) chainSelect.value = String(defaultChainId);
    if (gatewayEl) gatewayEl.value = (originInfo && originInfo.ipfsGateway) || DEFAULT_IPFS_GATEWAY;
    if (pinningEl) pinningEl.value = (originInfo && originInfo.pinningMethod) || "none";

    function getRpcForChain(chainId) {
      return window.__configRpcUrls[chainId] || DEFAULT_RPCS[chainId];
    }

    function setRpcForChain(chainId, url) {
      window.__configRpcUrls[chainId] = url;
    }

    function refreshRpcSelect(chainId) {
      if (!rpcSelect) return;
      var opts = RPC_OPTIONS[chainId] || [];
      var current = getRpcForChain(chainId);
      rpcSelect.innerHTML = "";
      opts.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o.url;
        opt.textContent = o.label;
        if (o.url === current) opt.selected = true;
        rpcSelect.appendChild(opt);
      });
      var hasCustom = opts.some(function (o) { return o.url === current; });
      if (!hasCustom) {
        var custom = document.createElement("option");
        custom.value = current;
        custom.textContent = current.indexOf("127.0.0.1") >= 0 ? "Local node" : "Custom";
        custom.selected = true;
        rpcSelect.appendChild(custom);
      }
      var customOpt = document.createElement("option");
      customOpt.value = "__custom__";
      customOpt.textContent = "Paste custom URL…";
      rpcSelect.appendChild(customOpt);
    }

    function refreshAddress(chainId) {
      var prefs = { defaultChainId: chainId, rpcUrls: { 42161: getRpcForChain(42161), 8453: getRpcForChain(8453) } };
      var built = buildConfigFromPrefs(prefs);
      window.__configSetupConfig = built;
      var account = wagmi.getAccount(built);
      var isConnected = account && account.status === "connected" && account.address;
      var displayChainId = isConnected ? account.chainId : null;
      var displayAddress = isConnected ? account.address : null;
      if (addressEl) {
        addressEl.textContent = "";
        addressEl.classList.add("hidden");
      }
      if (connectBtn) {
        show(connectBtn);
        connectBtn.classList.remove("hidden");
        if (isConnected) {
          var chainName = getChainName(displayChainId);
          var iconClass = "profile-chain-icon profile-chain-icon-" + (displayChainId === CHAIN_IDS.arbitrum ? "arbitrum" : displayChainId === CHAIN_IDS.base ? "base" : "chain");
          var iconHtml = displayChainId === CHAIN_IDS.arbitrum
            ? '<img src="arbitrum-logo.png" alt="' + escapeAttr(chainName) + '" class="' + iconClass + '" title="' + escapeAttr(chainName) + '" />'
            : '<span class="' + iconClass + '" title="' + escapeAttr(chainName) + '">' + (chainName.charAt(0)) + "</span>";
          connectBtn.innerHTML = iconHtml + '<span class="profile-connect-address">' + escapeHtml(truncateAddress(displayAddress)) + "</span>";
          connectBtn.className = "landing-btn config-setup-connect-btn profile-connect-btn";
          connectBtn.onclick = function () {
            show(getEl("profile-chain-overlay"));
          };
        } else {
          connectBtn.textContent = "Connect Wallet";
          connectBtn.className = "landing-btn config-setup-connect-btn";
          connectBtn.onclick = function () {
            var chainIdCur = parseInt(chainSelect.value, 10);
            var prefsCur = { defaultChainId: chainIdCur, rpcUrls: { 42161: getRpcForChain(42161), 8453: getRpcForChain(8453) } };
            var builtCur = buildConfigFromPrefs(prefsCur);
            window.__configSetupConfig = builtCur;
            showError("config-setup-error", "");
            connectWalletForChain(profile, builtCur, chainIdCur, function () {
              refreshAddress(chainIdCur);
            }, function (err) {
              showError("config-setup-error", err || "Connection failed.");
            });
          };
        }
      }
    }

    function onChainChange() {
      var chainId = parseInt(chainSelect.value, 10);
      refreshRpcSelect(chainId);
      refreshAddress(chainId);
    }

    refreshRpcSelect(defaultChainId);
    refreshAddress(defaultChainId);
    window.__configSetupRefresh = function (chainId) {
      if (chainSelect) chainSelect.value = String(chainId);
      refreshRpcSelect(chainId);
      refreshAddress(chainId);
    };

    if (chainSelect) chainSelect.onchange = onChainChange;

    if (rpcSelect) {
      rpcSelect.onchange = function () {
        var chainId = parseInt(chainSelect.value, 10);
        if (rpcSelect.value === "__custom__") {
          var url = window.prompt("Custom RPC URL", getRpcForChain(chainId));
          if (url && url.trim()) {
            setRpcForChain(chainId, url.trim());
            refreshRpcSelect(chainId);
          } else {
            rpcSelect.value = getRpcForChain(chainId);
          }
        } else {
          setRpcForChain(chainId, rpcSelect.value);
        }
      };
    }

    fetch(LOCAL_ARBITRUM_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.result != null && parseInt(chainSelect.value, 10) === CHAIN_IDS.arbitrum) {
          show(localPrompt);
          if (localMsg) localMsg.textContent = "Local Arbitrum RPC detected at " + LOCAL_ARBITRUM_RPC + ". Use this for RPC?";
          getEl("config-use-local").onclick = function () {
            hide(localPrompt);
            setRpcForChain(CHAIN_IDS.arbitrum, LOCAL_ARBITRUM_RPC);
            refreshRpcSelect(CHAIN_IDS.arbitrum);
          };
          getEl("config-use-public").onclick = function () {
            hide(localPrompt);
            setRpcForChain(CHAIN_IDS.arbitrum, DEFAULT_RPCS[42161]);
            refreshRpcSelect(CHAIN_IDS.arbitrum);
          };
          return;
        }
        hide(localPrompt);
      })
      .catch(function () {
        hide(localPrompt);
      });

    getEl("config-setup-continue").onclick = function () {
      var defaultChainIdSel = parseInt(chainSelect.value, 10);
      var rpcUrls = {};
      rpcUrls[CHAIN_IDS.arbitrum] = getRpcForChain(CHAIN_IDS.arbitrum);
      rpcUrls[CHAIN_IDS.base] = getRpcForChain(CHAIN_IDS.base);
      var prefs = { defaultChainId: defaultChainIdSel, rpcUrls: rpcUrls };
      var built = buildConfigFromPrefs(prefs);
      wagmi.getBlockNumber(built, { chainId: defaultChainIdSel })
        .then(function () {
          if (!profile.userInfo) profile.userInfo = {};
          if (!profile.userInfo[origin]) profile.userInfo[origin] = {};
          profile.userInfo[origin].config = prefs;
          var gatewayRaw = (getEl("config-ipfs-gateway") && getEl("config-ipfs-gateway").value.trim()) || "";
          profile.userInfo[origin].ipfsGateway = gatewayRaw ? (gatewayRaw.replace(/\/+$/, "") + "/") : DEFAULT_IPFS_GATEWAY;
          var pinningVal = (getEl("config-pinning-method") && getEl("config-pinning-method").value) || "none";
          profile.userInfo[origin].pinningMethod = pinningVal;
          var json = profile.serialize();
          var withConfig = DkeyUserProfile.deserialize(json, built);
          window.__dkeyProfile = withConfig;
          setStoredProfile( json);
          hide(getEl("config-setup"));
          ensureUsernameThenWalletThenGoToTerminal(withConfig, built, defaultChainIdSel);
        })
        .catch(function (e) {
          showError("config-setup-error", "RPC test failed: " + (e && e.message));
        });
    };
  }

  function connectWalletForChain(profile, builtConfig, requiredChainId, onDone, onError) {
    if (profile && profile.addresses && requiredChainId != null) {
      delete profile.addresses[requiredChainId];
      var json = profile.serialize();
      window.__dkeyProfile = profile;
      setStoredProfile( json);
    }
    function saveAndDone(address) {
      if (!address) return;
      profile.addresses = profile.addresses || {};
      profile.addresses[requiredChainId] = address;
      [viemChains.arbitrum.id, viemChains.base.id].forEach(function (id) {
        profile.addresses[id] = address;
      });
      var json = profile.serialize();
      window.__dkeyProfile = profile;
      setStoredProfile( json);
      if (onDone) onDone();
    }
    var connectors = wagmi.getConnectors(builtConfig);
    var connector = connectors && connectors[0];
    if (!connector) {
      if (onError) onError("No wallet connector available.");
      return;
    }
    disconnectAndClearStorage(builtConfig).then(function () {
      return wagmi.connect(builtConfig, { connector: connector, chainId: requiredChainId });
    })
      .then(function (result) {
        var address = result && result.accounts && result.accounts[0];
        if (typeof address === "object" && address && address.address) address = address.address;
        if (!address) {
          if (onError) onError("Could not get address from wallet.");
          return;
        }
        saveAndDone(address);
      })
      .catch(function (e) {
        if (onError) onError(e && e.message ? e.message : "Connection failed.");
      });
  }

  function ensureUsernameThenWalletThenGoToTerminal(profile, builtConfig, defaultChainId) {
    var origin = getOrigin();
    var username = profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].username;
    if (username && String(username).trim()) {
      ensureWalletThenGoToTerminal(profile, builtConfig, defaultChainId);
      return;
    }
    hide(getEl("landing"));
    hide(getEl("config-setup"));
    show(getEl("username-setup"));
    showError("username-setup-error", "");
    var input = getEl("username-input");
    if (input) input.value = "";
    getEl("username-setup-continue").onclick = function () {
      var name = (input && input.value) ? input.value.trim() : "";
      if (!name) {
        showError("username-setup-error", "Please enter your name.");
        return;
      }
      if (!profile.userInfo) profile.userInfo = {};
      if (!profile.userInfo[origin]) profile.userInfo[origin] = {};
      profile.userInfo[origin].username = name;
      var json = profile.serialize();
      window.__dkeyProfile = profile;
      setStoredProfile( json);
      ensureWalletThenGoToTerminal(profile, builtConfig, defaultChainId != null ? defaultChainId : getDefaultChainId(profile));
    };
  }

  function ensureWalletThenGoToTerminal(profile, builtConfig, defaultChainId) {
    var needChainId = defaultChainId != null ? defaultChainId : (builtConfig.chains && builtConfig.chains[0] && builtConfig.chains[0].id);
    var hasAddress = profile.addresses && needChainId != null && profile.addresses[needChainId];
    if (hasAddress) {
      hide(getEl("username-setup"));
      goToTerminal();
      return;
    }
    connectWalletForChain(profile, builtConfig, needChainId, function () {
      hide(getEl("username-setup"));
      goToTerminal();
    }, function (err) {
      showError("username-setup-error", err || "Connection failed.");
    });
  }

  function addLine(text, style, time) {
    if (typeof window.addLine !== "function") return;
    window.addLine(text, style == null ? "" : style, time == null ? 0 : time);
  }

  function shortCid(cid) {
    if (!cid) return "";
    var s = String(cid);
    return s.length > 16 ? s.slice(0, 12) + "..." : s;
  }

  var listingState = null;

  function showListingView(cid, chainId) {
    listingState = { cid: cid, chainId: chainId ? String(chainId) : null, details: null, bids: [], latestBidIndexQueried: -1, isDkeyOwner: false, isListingOwner: false, hasOpenBid: false };
    hide(getEl("profile-page"));
    hide(getEl("terminal"));
    hide(getEl("view-file-view"));
    show(getEl("listing-view"));
    show(getEl("listing-view-loading"));
    hide(getEl("listing-view-content"));
    showError("listing-view-error", "");
    fetchAndRenderListingDetails(cid);
    var profile = window.__dkeyProfile;
    if (profile) updateAppHeader(profile, "listing");
  }

  function hideListingView() {
    hide(getEl("listing-view"));
    showProfileViewAndCheckDKeys();
  }

  function showCreateListingView() {
    console.log("[CreateListing] Show create listing view.");
    hide(getEl("profile-page"));
    hide(getEl("terminal"));
    hide(getEl("view-file-view"));
    show(getEl("create-listing-view"));
    hide(getEl("create-listing-paste-cover-cid"));
    hide(getEl("create-listing-paste-cid"));
    hide(getEl("create-listing-success"));
    show(getEl("create-listing-form"));
    showError("create-listing-error", "");
    showError("create-listing-paste-cover-error", "");
    showError("create-listing-paste-error", "");
    setCreateListingStatus("");
    resetCreateListingForm();
    var chainSelect = getEl("create-listing-chain");
    var cfg = getListingConfig();
    var profile = window.__dkeyProfile;
    var defaultChainId = profile ? getDefaultChainId(profile) : CHAIN_IDS.arbitrum;
    if (chainSelect && cfg && cfg.chains && cfg.chains.length) {
      chainSelect.innerHTML = "";
      cfg.chains.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = c.name || (c.id === CHAIN_IDS.arbitrum ? "Arbitrum" : c.id === CHAIN_IDS.base ? "Base" : "Chain " + c.id);
        if (c.id === defaultChainId) opt.selected = true;
        chainSelect.appendChild(opt);
      });
    } else if (chainSelect) {
      chainSelect.innerHTML = "<option value=\"" + CHAIN_IDS.arbitrum + "\">Arbitrum</option><option value=\"" + CHAIN_IDS.base + "\">Base</option>";
      chainSelect.value = String(defaultChainId);
    }
    wireCreateListingForm();
    if (profile) updateAppHeader(profile, "create-listing");
  }

  function hideCreateListingView() {
    hide(getEl("create-listing-view"));
    showProfileViewAndCheckDKeys();
  }

  var viewFileState = { fileData: null, fileName: "", fileType: null, fileExtension: "", fileBlobUrl: null };

  function getViewFileType(extension) {
    var ext = (extension || "").toLowerCase();
    var imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
    var videoExtensions = ["mp4", "webm", "mov", "avi"];
    var audioExtensions = ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"];
    var textExtensions = ["txt", "md", "json", "xml", "csv", "log", "yml", "yaml", "html", "css", "js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "hpp", "sh", "bat", "ps1"];
    if (imageExtensions.indexOf(ext) >= 0) return "image";
    if (videoExtensions.indexOf(ext) >= 0) return "video";
    if (audioExtensions.indexOf(ext) >= 0) return "audio";
    if (textExtensions.indexOf(ext) >= 0 || ext === "") return "text";
    return "unsupported";
  }

  function renderViewFileContent() {
    var display = getEl("view-file-display");
    var nameEl = getEl("view-file-name");
    var downloadWrap = getEl("view-file-download-wrap");
    if (!display) return;
    display.innerHTML = "";
    if (viewFileState.fileBlobUrl) {
      URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = null;
    }
    if (nameEl) nameEl.textContent = viewFileState.fileName || "—";
    if (downloadWrap) hide(downloadWrap);
    var ft = viewFileState.fileType;
    var fd = viewFileState.fileData;
    var fn = viewFileState.fileName;
    if (ft === "image" && fd) {
      if (viewFileState.fileBlobUrl) URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = URL.createObjectURL(new Blob([fd]));
      var img = document.createElement("img");
      img.src = viewFileState.fileBlobUrl;
      img.alt = fn;
      img.className = "view-file-media";
      display.appendChild(img);
      if (downloadWrap) show(downloadWrap);
    } else if (ft === "video" && fd) {
      if (viewFileState.fileBlobUrl) URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = URL.createObjectURL(new Blob([fd]));
      var video = document.createElement("video");
      video.src = viewFileState.fileBlobUrl;
      video.controls = true;
      video.className = "view-file-media";
      display.appendChild(video);
      if (downloadWrap) show(downloadWrap);
    } else if (ft === "audio" && fd) {
      if (viewFileState.fileBlobUrl) URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = URL.createObjectURL(new Blob([fd]));
      var audio = document.createElement("audio");
      audio.src = viewFileState.fileBlobUrl;
      audio.controls = true;
      audio.className = "view-file-audio";
      display.appendChild(audio);
      if (downloadWrap) show(downloadWrap);
    } else if (ft === "text" && fd) {
      var pre = document.createElement("pre");
      pre.className = "view-file-text";
      try {
        pre.textContent = new TextDecoder().decode(fd);
      } catch (err) {
        pre.textContent = "Unable to decode text file.";
      }
      display.appendChild(pre);
      if (downloadWrap) show(downloadWrap);
    } else if (ft === "unsupported") {
      var msg = document.createElement("p");
      msg.className = "view-file-unsupported";
      msg.textContent = "This file type (." + (viewFileState.fileExtension || "unknown") + ") cannot be displayed here. Use DOWNLOAD below to save the file.";
      display.appendChild(msg);
      if (downloadWrap) show(downloadWrap);
    }
  }

  function loadViewFile(cid, chainIdNum) {
    var profile = window.__dkeyProfile;
    var loadingEl = getEl("view-file-loading");
    var errorEl = getEl("view-file-error");
    var display = getEl("view-file-display");
    if (!profile || !cid) {
      showError("view-file-error", "Missing profile or file.");
      if (loadingEl) hide(loadingEl);
      return;
    }
    var dkey = profile.getDKey(cid, chainIdNum);
    if (!dkey) {
      showError("view-file-error", "DKEY not found for this file.");
      if (loadingEl) hide(loadingEl);
      return;
    }
    var fileName = dkey.fileName || cid;
    var ext = fileName.split(".").pop();
    viewFileState.fileName = fileName;
    viewFileState.fileExtension = (ext && ext.toLowerCase()) || "";
    viewFileState.fileType = getViewFileType(viewFileState.fileExtension);
    viewFileState.fileData = null;
    var gateway = getIpfsGateway();
    var encryptedUrl = gateway.replace(/\/+$/, "") + "/" + cid + "/encrypted_file.enc";
    fetch(encryptedUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to fetch encrypted file (status " + res.status + ")");
        return res.arrayBuffer();
      })
      .then(function (encryptedBuffer) {
        return dkey.decryptFile(encryptedBuffer);
      })
      .then(function (decryptedBytes) {
        viewFileState.fileData = decryptedBytes;
        if (loadingEl) hide(loadingEl);
        showError("view-file-error", "");
        renderViewFileContent();
      })
      .catch(function (err) {
        if (loadingEl) hide(loadingEl);
        showError("view-file-error", err && err.message ? err.message : "Failed to load file.");
      });
  }

  function showViewFile(cid, chainId) {
    hide(getEl("profile-page"));
    hide(getEl("terminal"));
    hide(getEl("listing-view"));
    hide(getEl("create-listing-view"));
    show(getEl("view-file-view"));
    showError("view-file-error", "");
    var nameEl = getEl("view-file-name");
    if (nameEl) nameEl.textContent = "—";
    var display = getEl("view-file-display");
    if (display) display.innerHTML = "";
    hide(getEl("view-file-download-wrap"));
    var loadingEl = getEl("view-file-loading");
    if (loadingEl) show(loadingEl);
    var profile = window.__dkeyProfile;
    if (profile) updateAppHeader(profile, "view-file");
    var chainIdNum = chainId != null ? parseInt(chainId, 10) : null;
    if (viewFileState.fileBlobUrl) {
      URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = null;
    }
    loadViewFile(cid, chainIdNum);
  }

  function hideViewFile() {
    if (viewFileState.fileBlobUrl) {
      URL.revokeObjectURL(viewFileState.fileBlobUrl);
      viewFileState.fileBlobUrl = null;
    }
    viewFileState.fileData = null;
    viewFileState.fileName = "";
    viewFileState.fileType = null;
    hide(getEl("view-file-view"));
    showProfileViewAndCheckDKeys();
  }

  function updateAppHeader(profile, viewType) {
    var usernameEl = getEl("header-username");
    var connectWrap = getEl("header-connect-wrap");
    var connectErr = getEl("header-connect-error");
    var backBtn = getEl("header-action-btn");
    var gearBtn = getEl("header-gear-btn");
    if (!usernameEl || !connectWrap) return;
    var origin = getOrigin();
    var userInfo = profile.userInfo || {};
    var originInfo = (origin && userInfo[origin]) || {};
    var username = originInfo.username || userInfo.username || userInfo.displayName || "—";
    usernameEl.textContent = username;

    var torsoChar = (username && String(username) !== "—" && String(username).length > 0) ? String(username).charAt(0) : "|";
    var asciiEl = getEl("header-ascii");
    if (asciiEl) asciiEl.textContent = " 0\n /" + torsoChar + "\\\n ‖";

    var config = getListingConfig();
    var account = config ? wagmi.getAccount(config) : null;
    var isConnected = account && account.status === "connected" && account.address;
    var displayChainId = isConnected ? account.chainId : null;
    var displayAddress = isConnected ? account.address : null;
    var connectHtml = [];
    connectHtml.push('<button type="button" class="landing-btn profile-connect-btn" id="header-connect-wallet-btn">');
    if (isConnected) {
      var chainName = getChainName(displayChainId);
      var iconClass = "profile-chain-icon profile-chain-icon-" + (displayChainId === CHAIN_IDS.arbitrum ? "arbitrum" : displayChainId === CHAIN_IDS.base ? "base" : "chain");
      if (displayChainId === CHAIN_IDS.arbitrum) {
        connectHtml.push('<img src="arbitrum-logo.png" alt="' + escapeAttr(chainName) + '" class="' + iconClass + '" title="' + escapeAttr(chainName) + '" />');
      } else {
        connectHtml.push('<span class="' + iconClass + '" title="' + escapeAttr(chainName) + '">' + (chainName.charAt(0)) + "</span>");
      }
      connectHtml.push('<span class="profile-connect-address">' + escapeHtml(truncateAddress(displayAddress)) + "</span>");
    } else {
      connectHtml.push("Connect Wallet");
    }
    connectHtml.push("</button>");
    connectWrap.innerHTML = connectHtml.join("");
    if (connectErr) showError("header-connect-error", "");
    var headerConnectBtn = getEl("header-connect-wallet-btn");
    if (headerConnectBtn) {
      headerConnectBtn.addEventListener("click", function () {
        var cfg = getListingConfig();
        if (!cfg) return;
        showError("header-connect-error", "");
        var acc = wagmi.getAccount(cfg);
        if (!acc || acc.status !== "connected") {
          connectWalletForChain(profile, cfg, CHAIN_IDS.arbitrum, function () {
            updateAppHeader(window.__dkeyProfile, viewType);
          }, function (err) {
            showError("header-connect-error", err || "Connection failed.");
          });
        } else {
          show(getEl("profile-chain-overlay"));
        }
      });
    }

    if (backBtn) {
      if (viewType === "profile") {
        backBtn.classList.add("hidden");
      } else {
        backBtn.classList.remove("hidden");
      }
    }
    if (gearBtn) {
      if (viewType === "profile") {
        gearBtn.classList.remove("hidden");
      } else {
        gearBtn.classList.add("hidden");
      }
    }
  }

  var createListingState = null;

  function setCreateListingStatus(msg) {
    var el = getEl("create-listing-status");
    if (el) el.textContent = msg || "";
  }

  function resetCreateListingForm() {
    var fileEl = getEl("create-listing-file");
    var coverEl = getEl("create-listing-cover");
    if (fileEl) fileEl.value = "";
    if (coverEl) coverEl.value = "";
    var fileLabel = getEl("create-listing-file-label");
    var coverLabel = getEl("create-listing-cover-label");
    if (fileLabel) fileLabel.textContent = "Choose file";
    if (coverLabel) coverLabel.textContent = "Choose cover image";
    var dkeysEl = getEl("create-listing-dkeys");
    var priceEl = getEl("create-listing-price");
    var royaltyEl = getEl("create-listing-royalty");
    var descEl = getEl("create-listing-description");
    if (dkeysEl) dkeysEl.value = "";
    if (priceEl) priceEl.value = "";
    if (royaltyEl) royaltyEl.value = "";
    if (descEl) descEl.value = "";
    createListingState = null;
    updateCreateListingButton();
  }

  function isCreateListingFormValid() {
    var fileEl = getEl("create-listing-file");
    var coverEl = getEl("create-listing-cover");
    var dkeysEl = getEl("create-listing-dkeys");
    var priceEl = getEl("create-listing-price");
    var royaltyEl = getEl("create-listing-royalty");
    var descEl = getEl("create-listing-description");
    if (!fileEl || !fileEl.files || !fileEl.files[0]) return false;
    if (!coverEl || !coverEl.files || !coverEl.files[0]) return false;
    var dkeys = parseInt(dkeysEl && dkeysEl.value, 10);
    var price = parseFloat(priceEl && priceEl.value, 10);
    var royalty = parseInt(royaltyEl && royaltyEl.value, 10);
    var desc = (descEl && descEl.value || "").trim();
    if (!Number.isInteger(dkeys) || dkeys <= 0) return false;
    if (isNaN(price) || price <= 0) return false;
    if (!Number.isInteger(royalty) || royalty < 1 || royalty > 99) return false;
    if (desc === "") return false;
    return true;
  }

  function updateCreateListingButton() {
    var btn = getEl("create-listing-btn");
    if (btn) btn.disabled = !isCreateListingFormValid();
  }

  function wireCreateListingForm() {
    var fileEl = getEl("create-listing-file");
    var coverEl = getEl("create-listing-cover");
    var fileLabel = getEl("create-listing-file-label");
    var coverLabel = getEl("create-listing-cover-label");
    if (fileEl && fileLabel) {
      fileEl.onchange = function () {
        fileLabel.textContent = fileEl.files && fileEl.files[0] ? fileEl.files[0].name : "Choose file";
        updateCreateListingButton();
      };
    }
    if (coverEl && coverLabel) {
      coverEl.onchange = function () {
        coverLabel.textContent = coverEl.files && coverEl.files[0] ? coverEl.files[0].name : "Choose cover image";
        updateCreateListingButton();
      };
    }
    [getEl("create-listing-dkeys"), getEl("create-listing-price"), getEl("create-listing-royalty"), getEl("create-listing-description")].forEach(function (el) {
      if (el) el.oninput = updateCreateListingButton;
    });
    var btn = getEl("create-listing-btn");
    if (btn) btn.onclick = runCreateListingPipeline;
    var continueCoverCidBtn = getEl("create-listing-continue-cover-cid-btn");
    if (continueCoverCidBtn) continueCoverCidBtn.onclick = handlePasteCoverContinue;
    var continueCidBtn = getEl("create-listing-continue-cid-btn");
    if (continueCidBtn) continueCidBtn.onclick = handlePasteCidContinue;
    var copyBtn = getEl("create-listing-copy-btn");
    if (copyBtn) copyBtn.onclick = copyCreateListingShareLink;
  }

  function setCreateListingBusy(msg) {
    var el = getEl("create-listing-busy");
    if (el) {
      el.textContent = msg || "Processing…";
      if (msg) show(el); else hide(el);
    }
  }

  var IPFS_LOCAL_API = "http://127.0.0.1:5001/api/v0";

  function addFileToIpfsLocal(file) {
    console.log("[CreateListing] addFileToIpfsLocal:", file && file.name);
    var form = new FormData();
    form.append("file", file);
    return fetch(IPFS_LOCAL_API + "/add", { method: "POST", body: form })
      .then(function (res) {
        if (!res.ok) throw new Error("IPFS add failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        var cid = data.Hash || data.cid || (data.Cid && data.Cid["/"]) || null;
        console.log("[CreateListing] addFileToIpfsLocal result CID:", cid);
        return cid;
      });
  }

  function addDirectoryToIpfsLocal(entries) {
    console.log("[CreateListing] addDirectoryToIpfsLocal:", entries.length, "entries");
    var form = new FormData();
    var i;
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var path = entry.path || entry.name || "file-" + i;
      var content = entry.content;
      if (content instanceof File) form.append("file", content, path);
      else if (content instanceof Blob) form.append("file", content, path);
      else form.append("file", new Blob([content]), path);
    }
    return fetch(IPFS_LOCAL_API + "/add?wrap-with-directory=true", { method: "POST", body: form })
      .then(function (res) {
        if (!res.ok) throw new Error("IPFS add failed: " + res.status);
        return res.text();
      })
      .then(function (text) {
        var lines = text.trim().split("\n").filter(Boolean);
        var last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
        var dirCID = last && (last.Hash || (last.Cid && last.Cid["/"])) || null;
        console.log("[CreateListing] addDirectoryToIpfsLocal result directory CID:", dirCID);
        return dirCID;
      });
  }

  function saveAddressToProfile(profile, address, chainId, cfg) {
    if (!address || !profile) return;
    profile.addresses = profile.addresses || {};
    profile.addresses[chainId] = address;
    var chains = cfg && cfg.chains;
    if (chains && Array.isArray(chains)) {
      for (var i = 0; i < chains.length; i++) {
        profile.addresses[chains[i].id] = address;
      }
    }
    var json = profile.serialize();
    window.__dkeyProfile = profile;
    setStoredProfile( json);
  }

  function runCreateListingPipeline() {
    console.log("[CreateListing] Pipeline started.");
    if (!isCreateListingFormValid()) {
      console.warn("[CreateListing] Form invalid.");
      showError("create-listing-error", "Please fill all fields correctly.");
      return;
    }
    var profile = window.__dkeyProfile;
    var cfg = getListingConfig();
    if (!profile || !cfg) {
      console.warn("[CreateListing] No profile or config.");
      showError("create-listing-error", "Profile or chain config not loaded.");
      return;
    }
    var address = wagmi.getAccount(cfg).address;
    if (!address) {
      showConnectWalletRequiredOverlay();
      return;
    }
    var origin = getOrigin();
    var pinningMethod = (profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].pinningMethod) || "none";
    console.log("[CreateListing] Pinning method:", pinningMethod, "address:", address);
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    if (!dkey || !dkey.createKeyAndEncryptFile) {
      console.warn("[CreateListing] dkey-lib not loaded.");
      showError("create-listing-error", "dkey-lib not loaded.");
      return;
    }
    var chainSelect = getEl("create-listing-chain");
    var chainId = chainSelect ? parseInt(chainSelect.value, 10) : (cfg.chains && cfg.chains[0] && cfg.chains[0].id) || CHAIN_IDS.arbitrum;
    console.log("[CreateListing] Testing RPC for chainId:", chainId);
    setCreateListingStatus("Checking RPC…");
    setCreateListingBusy("Checking RPC…");
    var rpcTestTimeout = 10000;
    var rpcTestPromise = Promise.race([
      wagmi.getBlockNumber(cfg, { chainId: chainId }),
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("RPC timeout after " + rpcTestTimeout / 1000 + "s")); }, rpcTestTimeout);
      }),
    ]);
    rpcTestPromise
      .then(function (blockNum) {
        console.log("[CreateListing] RPC OK for chainId", chainId, "block:", blockNum);
        setCreateListingBusy("");
        setCreateListingStatus("");
        runCreateListingPipelineAfterRpcCheck();
      })
      .catch(function (e) {
        console.warn("[CreateListing] RPC check failed:", e && e.message);
        setCreateListingBusy("");
        setCreateListingStatus("");
        showError("create-listing-error", "RPC unreachable for chain " + chainId + ". " + (e && e.message ? e.message : "Check your config or try again."));
      });
    return;
  }

  function runCreateListingPipelineAfterRpcCheck() {
    var profile = window.__dkeyProfile;
    var cfg = getListingConfig();
    var address = wagmi.getAccount(cfg).address;
    var origin = getOrigin();
    var pinningMethod = (profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].pinningMethod) || "none";
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    var chainSelect = getEl("create-listing-chain");
    var selectedChainId = chainSelect ? parseInt(chainSelect.value, 10) : (cfg.chains && cfg.chains[0] && cfg.chains[0].id) || CHAIN_IDS.arbitrum;
    showError("create-listing-error", "");
    createListingState = {
      profile: profile,
      cfg: cfg,
      address: address,
      pinningMethod: pinningMethod,
      selectedChainId: selectedChainId,
      dkeys: parseInt(getEl("create-listing-dkeys").value, 10),
      price: parseFloat(getEl("create-listing-price").value, 10),
      royalty: parseInt(getEl("create-listing-royalty").value, 10),
      description: (getEl("create-listing-description").value || "").trim(),
      selectedFile: getEl("create-listing-file").files[0],
      coverFile: getEl("create-listing-cover").files[0],
      encryptedData: null,
      secretX: null,
      secretY: null,
      coverPhotoCID: null,
      coverPhotoLink: null,
      metadata: null,
      directoryCID: null,
    };
    console.log("[CreateListing] State created. Loading SnarkJS…");
    ensureSnarkJSLoaded()
      .then(function () {
        console.log("[CreateListing] SnarkJS loaded. Encrypting file…");
        setCreateListingStatus("Encrypting file…");
        setCreateListingBusy("Encrypting file…");
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            dkey.createKeyAndEncryptFile(reader.result).then(function (out) {
              createListingState.encryptedData = out.encryptedData;
              createListingState.secretX = out.secretKeyX;
              createListingState.secretY = out.secretKeyY;
              console.log("[CreateListing] File encrypted.");
              resolve();
            }).catch(reject);
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(createListingState.selectedFile);
        });
      })
      .then(function () {
        if (createListingState.pinningMethod === "local") {
          console.log("[CreateListing] Pinning method local: uploading cover to IPFS…");
          setCreateListingBusy("");
          setCreateListingStatus("Uploading cover…");
          setCreateListingBusy("Uploading cover…");
          return addFileToIpfsLocal(createListingState.coverFile).then(function (coverCID) {
            console.log("[CreateListing] Cover uploaded, CID:", coverCID);
            createListingState.coverPhotoCID = coverCID;
            createListingState.coverPhotoLink = getIpfsGateway() + coverCID;
            return continueAfterCover();
          });
        }
        console.log("[CreateListing] Pinning method none: showing paste cover CID step.");
        setCreateListingBusy("");
        setCreateListingStatus("Upload your cover image to IPFS, then paste the cover photo CID below.");
        hide(getEl("create-listing-form"));
        show(getEl("create-listing-paste-cover-cid"));
        getEl("create-listing-pasted-cover-cid").value = "";
        showError("create-listing-paste-cover-error", "");
        return Promise.resolve();
      })
      .catch(function (e) {
        console.warn("[CreateListing] Pipeline error:", e && e.message, e);
        setCreateListingBusy("");
        setCreateListingStatus("");
        showError("create-listing-error", e && e.message ? e.message : "Failed.");
      });
  }

  function continueAfterCover() {
    console.log("[CreateListing] continueAfterCover: building metadata…");
    setCreateListingStatus("Preparing…");
    setCreateListingBusy("Preparing…");
    var chainIds = [createListingState.selectedChainId];
    var blockPromise = window.dkeyLib && window.dkeyLib.dkey && window.dkeyLib.dkey.getCurrentBlock
      ? window.dkeyLib.dkey.getCurrentBlock(createListingState.cfg)
      : null;
    if (blockPromise && typeof blockPromise.then !== "function") blockPromise = Promise.resolve(blockPromise);
    var withTimeout = blockPromise
      ? Promise.race([
          blockPromise,
          new Promise(function (resolve) {
            setTimeout(function () {
              console.warn("[CreateListing] getCurrentBlock timed out, using 0");
              resolve(0);
            }, 15000);
          }),
        ])
      : Promise.resolve(0);
    return withTimeout
      .catch(function (e) {
        console.warn("[CreateListing] getCurrentBlock failed:", e && e.message, "using 0");
        return 0;
      })
      .then(function (currentBlock) {
        console.log("[CreateListing] Current block:", currentBlock);
        var ListingMetadata = window.dkeyLib && window.dkeyLib.ListingMetadata;
        var origin = getOrigin();
        var username = (createListingState.profile.userInfo && createListingState.profile.userInfo[origin] && createListingState.profile.userInfo[origin].username) || "—";
        var seller = { fname: username, fid: "", pfpUrl: "" };
        var meta = {
          seller: seller,
          fileName: createListingState.selectedFile.name,
          fileDescription: createListingState.description,
          fileSizeInBytes: createListingState.selectedFile.size,
          dkeyPrice: createListingState.price,
          coverPhotoCID: createListingState.coverPhotoCID,
          coverPhotoLink: createListingState.coverPhotoLink,
          chainIds: chainIds,
          listingCreatedAfterBlock: Number(currentBlock) || 0,
        };
        if (ListingMetadata) {
          createListingState.metadata = new ListingMetadata(seller, meta.fileName, meta.fileDescription, meta.fileSizeInBytes, meta.dkeyPrice, meta.coverPhotoCID, meta.coverPhotoLink, meta.chainIds, meta.listingCreatedAfterBlock);
        } else {
          createListingState.metadata = meta;
        }
        var metadataJson = JSON.stringify(createListingState.metadata && createListingState.metadata.toJSON ? createListingState.metadata.toJSON() : createListingState.metadata, null, 2);
        var metadataBlob = new Blob([metadataJson], { type: "application/json" });
        var metadataFile = new File([metadataBlob], "metadata.json", { type: "application/json" });
        var encBlob = new Blob([createListingState.encryptedData]);
        var encFile = new File([encBlob], "encrypted_file.enc", { type: "application/octet-stream" });
        createListingState.metadataFile = metadataFile;
        createListingState.encFile = encFile;
        createListingState.metadataJson = metadataJson;
        console.log("[CreateListing] Metadata and directory files built.");
        if (createListingState.pinningMethod === "local") {
          console.log("[CreateListing] Pinning directory to local IPFS…");
          setCreateListingStatus("Pinning to local IPFS…");
          setCreateListingBusy("Pinning to local IPFS…");
          return addDirectoryToIpfsLocal([
            { path: "metadata.json", content: metadataFile },
            { path: "encrypted_file.enc", content: encFile },
          ]).then(function (dirCID) {
            createListingState.directoryCID = dirCID;
            console.log("[CreateListing] Directory pinned, calling createListing on chain…");
            return callCreateListingOnChain(dirCID);
          });
        }
        console.log("[CreateListing] Showing paste directory CID step.");
        setCreateListingBusy("");
        setCreateListingStatus("Download the files below, pin them to IPFS, then paste the directory CID.");
        var wrap = getEl("create-listing-download-wrap");
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
        offerCreateListingDownload();
        hide(getEl("create-listing-form"));
        hide(getEl("create-listing-paste-cover-cid"));
        show(getEl("create-listing-paste-cid"));
        getEl("create-listing-pasted-cid").value = "";
        showError("create-listing-paste-error", "");
        return Promise.resolve();
      });
  }

  function handlePasteCoverContinue() {
    var input = getEl("create-listing-pasted-cover-cid");
    var cid = (input && input.value && input.value.trim()) || "";
    if (!cid) {
      showError("create-listing-paste-cover-error", "Paste the cover photo CID first.");
      return;
    }
    console.log("[CreateListing] Paste cover CID:", cid);
    showError("create-listing-paste-cover-error", "");
    createListingState.coverPhotoCID = cid;
    createListingState.coverPhotoLink = getIpfsGateway() + cid;
    hide(getEl("create-listing-paste-cover-cid"));
    setCreateListingStatus("Preparing…");
    setCreateListingBusy("Preparing…");
    continueAfterCover()
      .then(function () {
        setCreateListingBusy("");
      })
      .catch(function (e) {
        console.warn("[CreateListing] handlePasteCoverContinue error:", e && e.message);
        setCreateListingBusy("");
        setCreateListingStatus("");
        showError("create-listing-error", e && e.message ? e.message : "Failed.");
      });
  }

  function offerCreateListingDownload() {
    if (!createListingState || !createListingState.metadataFile || !createListingState.encFile) return;
    var pasteSection = getEl("create-listing-paste-cid");
    if (!pasteSection || getEl("create-listing-download-wrap")) return;
    var link1 = document.createElement("a");
    link1.href = URL.createObjectURL(createListingState.metadataFile);
    link1.download = "metadata.json";
    link1.textContent = "Download metadata.json";
    link1.className = "profile-link";
    var link2 = document.createElement("a");
    link2.href = URL.createObjectURL(createListingState.encFile);
    link2.download = "encrypted_file.enc";
    link2.textContent = "Download encrypted_file.enc";
    link2.className = "profile-link";
    var wrap = document.createElement("p");
    wrap.id = "create-listing-download-wrap";
    wrap.className = "profile-section-label";
    wrap.textContent = "Download files (pin both to IPFS as a directory): ";
    var div = document.createElement("span");
    div.appendChild(link1);
    div.appendChild(document.createTextNode(" | "));
    div.appendChild(link2);
    wrap.appendChild(div);
    if (pasteSection.firstChild) pasteSection.insertBefore(wrap, pasteSection.firstChild);
    else pasteSection.appendChild(wrap);
  }

  function handlePasteCidContinue() {
    var input = getEl("create-listing-pasted-cid");
    var cid = (input && input.value && input.value.trim()) || "";
    if (!cid) {
      showError("create-listing-paste-error", "Paste the directory CID first.");
      return;
    }
    console.log("[CreateListing] Paste directory CID:", cid, "calling createListing on chain…");
    showError("create-listing-paste-error", "");
    callCreateListingOnChain(cid);
  }

  function callCreateListingOnChain(ipfsCID) {
    console.log("[CreateListing] callCreateListingOnChain ipfsCID:", ipfsCID);
    if (!createListingState || !createListingState.profile || !createListingState.metadata) {
      console.warn("[CreateListing] callCreateListingOnChain: missing state.");
      showError("create-listing-error", "Missing listing data.");
      return;
    }
    var profile = createListingState.profile;
    var metadata = createListingState.metadata;
    var address = createListingState.address;
    setCreateListingStatus("Creating listing on chain…");
    setCreateListingBusy("Sign tx to create listing on chain…");
    var secretKeyArr = [String(createListingState.secretX), String(createListingState.secretY)];
    var chainId = createListingState.selectedChainId;
    var createListingOpts = chainId != null ? { chainId: chainId } : undefined;
    profile.createListing(ipfsCID, metadata, secretKeyArr, createListingState.dkeys, createListingState.royalty, address, createListingOpts)
      .then(function (result) {
        setCreateListingBusy("");
        setCreateListingStatus("");
        var success = result && result.success === true;
        var updatedProfile = result && (result.profile != null ? result.profile : result.updatedProfile);
        console.log("[CreateListing] createListing result:", success ? "success" : "failed", result && result.result);
        if (success && updatedProfile) {
          window.__dkeyProfile = updatedProfile;
          setStoredProfile( updatedProfile.serialize());
          hide(getEl("create-listing-form"));
          hide(getEl("create-listing-paste-cid"));
          show(getEl("create-listing-success"));
          var base = typeof window !== "undefined" && window.location ? (window.location.origin + (window.location.pathname || "/")) : getOrigin() + "/";
          var shareUrl = base + "?listing=" + encodeURIComponent(ipfsCID);
          var shareInput = getEl("create-listing-share-url");
          if (shareInput) shareInput.value = shareUrl;
          console.log("[CreateListing] Listing created. Share URL:", shareUrl);
        } else {
          showError("create-listing-error", (result && result.result) || (result && result.message) || "Create listing failed.");
        }
      })
      .catch(function (e) {
        console.warn("[CreateListing] createListing error:", e && e.message, e);
        setCreateListingBusy("");
        setCreateListingStatus("");
        showError("create-listing-error", e && e.message ? e.message : "Create listing failed.");
      });
  }

  function copyCreateListingShareLink() {
    var input = getEl("create-listing-share-url");
    if (!input || !input.value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(function () {
        var btn = getEl("create-listing-copy-btn");
        if (btn) btn.textContent = "Copied!";
        setTimeout(function () { if (btn) btn.textContent = "Copy link"; }, 2000);
      });
    }
  }

  function formatFileSize(bytes) {
    if (bytes == null || isNaN(bytes) || bytes < 0) return "";
    if (bytes < 100) return "<0.1 KB";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, "") + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " GB";
  }

  function formatBidAmountEth(amountStr) {
    var n = parseFloat(amountStr);
    if (isNaN(n) || n < 0) return "0";
    var s = n.toFixed(6);
    return s.replace(/\.?0+$/, "") || "0";
  }

  function getListingConfig() {
    var profile = window.__dkeyProfile;
    if (!profile) return null;
    if (profile.config) return profile.config;
    var origin = getOrigin();
    var prefs = profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].config;
    if (prefs && prefs.rpcUrls && (prefs.defaultChainId != null || (prefs.chainIds && prefs.chainIds.length))) return buildConfigFromPrefs(prefs);
    return null;
  }

  function getIpfsGateway() {
    var profile = window.__dkeyProfile;
    var g = DEFAULT_IPFS_GATEWAY;
    if (profile) {
      var origin = getOrigin();
      var saved = profile.userInfo && profile.userInfo[origin] && profile.userInfo[origin].ipfsGateway;
      if (saved && typeof saved === "string" && saved.trim()) {
        g = saved.trim().replace(/\/+$/, "") + "/";
      }
    }
    return ensureAbsoluteGatewayUrl(g);
  }

  function fetchAndRenderListingDetails(cid) {
    if (!listingState || listingState.cid !== cid) return;
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    if (!dkey) {
      hide(getEl("listing-view-loading"));
      showError("listing-view-error", "dkey-lib not loaded.");
      return;
    }
    var cfg = getListingConfig();
    fetch(getIpfsGateway() + cid + "/metadata.json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to fetch metadata: " + res.status);
        return res.json();
      })
      .then(function (listingMetadata) {
        if (!listingState || listingState.cid !== cid) return;
        if (!cfg) {
          hide(getEl("listing-view-loading"));
          showError("listing-view-error", "No chain config. Load profile with config to view listing.");
          return;
        }
        var meta = listingMetadata;
        var wantChainId = listingState.chainId ? parseInt(listingState.chainId, 10) : null;
        if (wantChainId != null && meta.chainIds && meta.chainIds.length && meta.chainIds[0] !== wantChainId) {
          var idx = meta.chainIds.indexOf(wantChainId);
          if (idx >= 0) {
            var reordered = meta.chainIds.slice();
            reordered.splice(idx, 1);
            reordered.unshift(wantChainId);
            meta = Object.assign({}, meta, { chainIds: reordered });
          }
        }
        return dkey.fetchListingDetails(cid, meta, cfg).then(function (details) {
          if (!listingState || listingState.cid !== cid) return;
          listingState.details = details;
          listingState.listingMetadata = listingMetadata;
          var profile = window.__dkeyProfile;
          var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : (details.chainIds && details.chainIds[0]);
          if (profile && chainId) {
            try {
              listingState.isDkeyOwner = profile.isDkeyOwner(cid, chainId);
              listingState.isListingOwner = profile.isListingOwner(cid, chainId);
              listingState.hasOpenBid = profile.hasOpenBid(cid, chainId);
            } catch (e) {
              listingState.isDkeyOwner = false;
              listingState.isListingOwner = false;
              listingState.hasOpenBid = false;
            }
          }
          hide(getEl("listing-view-loading"));
          show(getEl("listing-view-content"));
          showError("listing-view-error", "");
          renderListingContent();
        });
      })
      .catch(function (e) {
        if (!listingState || listingState.cid !== cid) return;
        hide(getEl("listing-view-loading"));
        var msg = (e && e.message && (e.message.indexOf("404") !== -1 || e.message.indexOf("Not Found") !== -1))
          ? "Listing not found."
          : (e && e.message ? e.message : "Failed to load listing.");
        showError("listing-view-error", msg);
      });
  }

  function renderListingContent() {
    var content = getEl("listing-view-content");
    if (!content || !listingState || !listingState.details) return;
    var d = listingState.details;
    var html = [];
    var fileName = d.fileName || d.cidString || listingState.cid || "—";
    var sizeStr = d.fileSizeInBytes != null ? formatFileSize(d.fileSizeInBytes) : "";
    var titleHtml = escapeHtml(fileName);
    if (sizeStr) titleHtml += ' <span class="listing-title-size">[' + escapeHtml(sizeStr) + "]</span>";
    html.push('<p class="listing-title">' + titleHtml + "</p>");
    if (d.coverPhotoLink) {
      html.push('<div class="listing-cover-wrap"><img src="' + escapeAttr(ensureAbsoluteGatewayUrl(d.coverPhotoLink)) + '" alt="Cover" class="listing-cover" /></div>');
    }
    var sellerText = "—";
    if (d.seller) {
      sellerText = [d.seller.fname, d.seller.fid, d.seller.twitterUrl].filter(Boolean).join(" · ") || "—";
    }
    html.push('<p class="listing-row"><span class="listing-label">Seller:</span><br/> <span class="listing-seller-name">' + (d.seller && d.seller.twitterUrl ? '<a href="' + escapeAttr(d.seller.twitterUrl) + '" target="_blank" rel="noopener">' + escapeHtml(sellerText) + "</a>" : escapeHtml(sellerText)) + "</span></p>");
    html.push('<p class="listing-row"><span class="listing-label">Description:</span><br/> <span class="listing-description-value">"' + (d.description ? escapeHtml(d.description) : "—") + '"</span></p>');
    var priceStr = "—";
    if (d.priceInEth != null) {
      priceStr = typeof d.priceInEth === "bigint" ? viem.formatEther(d.priceInEth) : String(d.priceInEth);
    }
    html.push('<p class="listing-row listing-row-spread"><span class="listing-label">Suggested Price:</span><span class="listing-value">' + escapeHtml(priceStr) + " ETH</span></p>");
    html.push('<p class="listing-row listing-row-spread"><span class="listing-label">Circulating supply:</span> <span class="listing-value">' + (d.howManyDKeysForSale != null ? d.howManyDKeysForSale : "—") + " DKEY(s)</span></p>");
    html.push('<p class="listing-row listing-row-spread"><span class="listing-label">Total sales:</span> <span class="listing-value">' + (d.howManyDKeysSold != null ? d.howManyDKeysSold : "—") + " DKEY(s)</span></p>");
    html.push('<p class="listing-row listing-row-spread"><span class="listing-label">Royalty on re-sale:</span> <span class="listing-value">' + (d.royaltyPercentage != null ? escapeHtml(String(d.royaltyPercentage)) + "%" : "—") + "</span></p>");
    var openBidsCount = d.openBidsCounter != null ? d.openBidsCounter : (listingState.bids ? listingState.bids.filter(function (b) { return parseFloat(b.bidAmountInEth) > 0; }).length : 0);
    html.push('<p class="listing-row listing-row-spread"><span class="listing-label">Open bids:</span> <span class="listing-value">' + openBidsCount + "</span></p>");
    html.push('<div class="listing-place-bid hidden" id="listing-place-bid"><div class="listing-bid-amount-wrap"><input type="number" step="0.000001" min="0" class="landing-input" id="listing-bid-amount" placeholder="0" /><span class="listing-bid-amount-suffix">&nbsp;&nbsp;&nbsp;ETH</span></div><button type="button" class="landing-btn" id="listing-place-bid-btn">BID</button><p class="landing-error hidden" id="listing-place-bid-error"></p></div>');
    html.push('<ul class="listing-bids-list" id="listing-bids-list"></ul>');
    html.push('<button type="button" class="landing-btn listing-bids-full-btn hidden" id="listing-view-open-bids-btn">VIEW OPEN BIDs</button>');
    html.push('<button type="button" class="landing-btn listing-bids-full-btn hidden" id="listing-show-more-bids-btn">SHOW MORE BIDs</button>');
    html.push('<br/><p id="listing-no-open-bids" class="listing-no-open-bids hidden">No open bids at this time. <a href="#" class="listing-share-link" id="listing-view-share-link">Share</a> a link to this listing.</p>');
    
    content.innerHTML = html.join("");
    var viewOpenBtn = getEl("listing-view-open-bids-btn");
    var showMoreBtn = getEl("listing-show-more-bids-btn");
    var hasOpenOnChain = (d.openBidsCounter != null && d.openBidsCounter > 0);
    var bidsLoaded = listingState.bids && listingState.bids.length > 0;
    var moreToFetch = hasOpenOnChain && listingState.latestBidIndexQueried >= 0 && (listingState.latestBidIndexQueried + 1) < d.openBidsCounter;
    if (viewOpenBtn) { viewOpenBtn.classList.toggle("hidden", !hasOpenOnChain || bidsLoaded); }
    if (showMoreBtn) { showMoreBtn.classList.toggle("hidden", !moreToFetch); }
    renderListingBids();
    updateListingActionVisibility();
    wireListingBidsAndPlaceBid();
  }

  function renderListingBids() {
    var list = getEl("listing-bids-list");
    if (!list || !listingState || !listingState.bids) return;
    list.innerHTML = "";
    var withIndex = listingState.bids.map(function (bid, idx) { return { bid: bid, idx: idx }; });
    var openBids = withIndex.filter(function (o) {
      var amt = o.bid.bidAmountInEth != null ? parseFloat(String(o.bid.bidAmountInEth)) : 0;
      return !isNaN(amt) && amt > 0;
    });
    console.log("[renderListingBids]", { bidsLength: listingState.bids.length, withIndexLength: withIndex.length, openBidsLength: openBids.length, amounts: withIndex.map(function (o) { return { idx: o.idx, bidAmountInEth: o.bid.bidAmountInEth, parsed: o.bid.bidAmountInEth != null ? parseFloat(String(o.bid.bidAmountInEth)) : NaN }; }) });
    openBids.forEach(function (o) {
      var bid = o.bid;
      var idx = o.idx;
      var bidNum = (bid.bidNumber != null ? bid.bidNumber : idx) + 1;
      var amountStr = formatBidAmountEth(bid.bidAmountInEth) + " ETH";
      var li = document.createElement("li");
      li.className = "listing-bid-item-inline";
      var text = document.createElement("span");
      text.className = "listing-bid-text";
      text.textContent = "#" + bidNum + " | " + amountStr;
      li.appendChild(text);
      var actionsWrap = document.createElement("div");
      actionsWrap.className = "listing-bid-actions-inline";
      if (listingState.isListingOwner) {
        var fillBtn = document.createElement("button");
        fillBtn.type = "button";
        fillBtn.className = "listing-bid-action-link";
        fillBtn.textContent = "[FILL]";
        fillBtn.dataset.bidIndex = String(idx);
        fillBtn.dataset.action = "fill";
        actionsWrap.appendChild(fillBtn);
      }
      if (listingState.isDkeyOwner && !listingState.isListingOwner) {
        var sellBtn = document.createElement("button");
        sellBtn.type = "button";
        sellBtn.className = "listing-bid-action-link";
        sellBtn.textContent = "[SELL]";
        sellBtn.dataset.bidIndex = String(idx);
        sellBtn.dataset.action = "sell";
        actionsWrap.appendChild(sellBtn);
      }
      li.appendChild(actionsWrap);
      list.appendChild(li);
    });
    var noOpenBidsEl = getEl("listing-no-open-bids");
    if (noOpenBidsEl) {
      var openBidsCounter = listingState.details && listingState.details.openBidsCounter != null ? listingState.details.openBidsCounter : null;
      var knownZero = openBidsCounter === 0;
      var loadedAndNoneOpen = listingState.bids.length > 0 && openBids.length === 0;
      if (knownZero || loadedAndNoneOpen) show(noOpenBidsEl); else hide(noOpenBidsEl);
    }
  }

  function updateListingActionVisibility() {
    var placeBidDiv = getEl("listing-place-bid");
    if (!placeBidDiv) return;
    var profile = window.__dkeyProfile;
    var canBid = profile && !listingState.isListingOwner && !listingState.isDkeyOwner;
    if (canBid) show(placeBidDiv); else hide(placeBidDiv);
  }

  function wireListingBidsAndPlaceBid() {
    var viewOpenBtn = getEl("listing-view-open-bids-btn");
    var showMoreBtn = getEl("listing-show-more-bids-btn");
    if (viewOpenBtn) viewOpenBtn.onclick = triggerFetchBids;
    if (showMoreBtn) showMoreBtn.onclick = triggerFetchBids;
    var shareLink = getEl("listing-view-share-link");
    if (shareLink) {
      shareLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (listingState && listingState.cid) {
          var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : null;
          showShareListingOverlay(listingState.cid, chainId);
        }
      });
    }
    var placeBidBtn = getEl("listing-place-bid-btn");
    if (placeBidBtn) placeBidBtn.onclick = handlePlaceBid;
    var list = getEl("listing-bids-list");
    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest && e.target.closest("button[data-action]");
        if (!btn) return;
        var action = btn.getAttribute("data-action");
        var idx = parseInt(btn.getAttribute("data-bid-index"), 10);
        if (action === "fill") handleListingOwnerFillsBid(idx);
        if (action === "sell") handleDkeyOwnerFillsBid(idx);
      });
    }
  }

  function ensureSnarkJSLoaded() {
    if (typeof window !== "undefined" && window.snarkjs) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "snarkjs.min.js";
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Failed to load snarkjs.min.js")); };
      document.body.appendChild(script);
    });
  }

  function triggerFetchBids() {
    if (!listingState || !listingState.details) return;
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    var BidLite = window.dkeyLib && window.dkeyLib.BidLite;
    var cfg = getListingConfig();
    if (!dkey || !cfg || !BidLite) return;
    var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : (listingState.details.chainIds && listingState.details.chainIds[0]);
    if (!chainId) return;
    var cidString = listingState.details.cidString || listingState.cid;
    var start = listingState.latestBidIndexQueried + 1;
    var openBidsCounter = (listingState.details && listingState.details.openBidsCounter != null) ? Number(listingState.details.openBidsCounter) : 0;
    var remaining = Math.max(0, openBidsCounter - start);
    var batchSize = remaining === 0 ? 0 : Math.min(20, remaining);
    if (batchSize === 0 && start === 0 && listingState.bids.length === 0) batchSize = 1;
    if (batchSize <= 0) return;
    var startingIndex1Based = start + 1;
    dkey.fetchOpenBids(chainId, cidString, startingIndex1Based, batchSize, cfg).then(function (result) {
      if (!listingState) return;
      console.log("[fetchOpenBids] raw result", { type: typeof result, isArray: Array.isArray(result), length: result && result.length, result: result, firstItem: result && result[0], firstItemKeys: result && result[0] != null && typeof result[0] === "object" ? Object.keys(result[0]) : null });
      var arr = null;
      if (Array.isArray(result) && (result.length === 0 || Array.isArray(result[0]) || (typeof result[0] === "object" && result[0] !== null))) {
        arr = result;
      } else if (result && typeof result.length === "number" && result.length > 0) {
        arr = Array.prototype.slice.call(result);
      } else if (result && result[0] != null) {
        arr = Array.isArray(result[0]) ? result[0] : [result[0]];
      }
      console.log("[fetchOpenBids] derived arr", { arrLength: arr ? arr.length : 0, arr: arr });
      if (!arr || !arr.length) {
        console.log("[fetchOpenBids] no items, returning");
        if (listingState.details && listingState.details.openBidsCounter > 0 && listingState.bids.length === 0) renderListingContent();
        return;
      }
      arr.forEach(function (item, i) {
        var pubKeyX = item[0] != null ? item[0] : item.pubKeyX;
        var pubKeyY = item[1] != null ? item[1] : item.pubKeyY;
        var bidAmount = item[2] != null ? item[2] : item.bidAmount;
        var bidNumber = start + listingState.bids.length;
        var amountStr = typeof bidAmount === "bigint" ? viem.formatEther(bidAmount) : (bidAmount != null ? String(bidAmount) : "0");
        console.log("[fetchOpenBids] item " + i, { item: item, pubKeyX: pubKeyX, pubKeyY: pubKeyY, bidAmount: bidAmount, bidAmountType: typeof bidAmount, amountStr: amountStr });
        var bid = new BidLite(bidNumber, cidString, String(pubKeyX), String(pubKeyY), amountStr);
        listingState.bids.push(bid);
      });
      listingState.latestBidIndexQueried = start + arr.length - 1;
      console.log("[fetchOpenBids] after push", { bidsLength: listingState.bids.length, bidsSummary: listingState.bids.map(function (b) { return { bidNumber: b.bidNumber, bidAmountInEth: b.bidAmountInEth }; }) });
      renderListingContent();
    }).catch(function (e) {
      console.log("[fetchOpenBids] catch", e);
      showError("listing-view-error", e && e.message ? e.message : "Failed to load bids.");
    });
  }

  function setListingBusy(msg) {
    var el = getEl("listing-view-busy");
    if (el) {
      el.textContent = msg || "Processing…";
      if (msg) show(el); else hide(el);
    }
  }

  function handlePlaceBid() {
    var profile = window.__dkeyProfile;
    var cfg = getListingConfig();
    if (!profile || !cfg || !listingState || !listingState.details) {
      showError("listing-view-error", "Profile or config not loaded.");
      return;
    }
    var amountEl = getEl("listing-bid-amount");
    var amountStr = amountEl ? amountEl.value.trim() : "";
    var amount = parseFloat(amountStr, 10);
    var MIN_BID_ETH = 0.000001;
    if (isNaN(amount) || amount < MIN_BID_ETH) {
      showError("listing-place-bid-error", "Enter at least " + MIN_BID_ETH + " ETH.");
      return;
    }
    var address = wagmi.getAccount(cfg).address;
    if (!address) {
      showConnectWalletRequiredOverlay();
      return;
    }
    var cidString = listingState.details.cidString || listingState.cid;
    var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : (listingState.details.chainIds && listingState.details.chainIds[0]);
    var listingMetadata = listingState.listingMetadata || listingState.details.listingMetadata || {};
    setListingBusy("Sign tx to place bid…");
    showError("listing-place-bid-error", "");
    profile.makeBid(cidString, amount, listingMetadata, address, chainId, listingState.details.canDkeysBeSold).then(function (result) {
      setListingBusy("");
      if (result && result.success && result.profile) {
        window.__dkeyProfile = result.profile;
        setStoredProfile(result.profile.serialize());
        listingState.isDkeyOwner = result.profile.isDkeyOwner(cidString, chainId);
        listingState.isListingOwner = result.profile.isListingOwner(cidString, chainId);
        listingState.hasOpenBid = result.profile.hasOpenBid(cidString, chainId);
        if (listingState.details.openBidsCounter != null) listingState.details.openBidsCounter++;
        renderListingContent();
        showError("listing-view-error", "");
        showError("listing-place-bid-error", "");
        showTxSuccessOverlayWithMessage("Your bid of " + formatEthForDisplay(amount) + " ETH has been placed.");
      } else {
        showError("listing-view-error", (result && result.result) || "Place bid failed.");
      }
    }).catch(function (e) {
      setListingBusy("");
      showError("listing-view-error", e && e.message ? e.message : "Place bid failed.");
    });
  }

  var BID_NOT_OPEN_SENTINEL = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  function handleListingOwnerFillsBid(bidIndex) {
    if (!listingState || !listingState.bids[bidIndex]) return;
    var bid = listingState.bids[bidIndex];
    var profile = window.__dkeyProfile;
    var cfg = getListingConfig();
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    if (!profile || !cfg || !dkey) return;
    var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : (listingState.details.chainIds && listingState.details.chainIds[0]);
    var account = wagmi.getAccount(cfg);
    if (!account || account.status !== "connected" || !account.address) {
      showConnectWalletRequiredOverlay();
      return;
    }
    var cidString = listingState.details.cidString || listingState.cid;
    setListingBusy("Sign tx to fill bid…");
    ensureSnarkJSLoaded().then(function () {
      return dkey.fetchBidStatus(chainId, bid, cfg);
    }).then(function (status) {
      var amount = status && status[0] != null ? status[0] : BigInt(0);
      if (amount === BigInt(0) || amount === BID_NOT_OPEN_SENTINEL) {
        setListingBusy("");
        listingState.bids.splice(bidIndex, 1);
        if (listingState.details.openBidsCounter != null && listingState.details.openBidsCounter > 0) listingState.details.openBidsCounter--;
        renderListingContent();
        showError("listing-view-error", "Bid not open.");
        return;
      }
      var bidAmountInEth = bid.bidAmountInEth != null ? String(bid.bidAmountInEth) : "0";
      return profile.fillBid(cidString, bid.pubKeyX, bid.pubKeyY, bidAmountInEth, chainId).then(function (result) {
        setListingBusy("");
        if (result && result.success && result.profile) {
          window.__dkeyProfile = result.profile;
          setStoredProfile(result.profile.serialize());
          listingState.bids.splice(bidIndex, 1);
          if (listingState.details.openBidsCounter != null && listingState.details.openBidsCounter > 0) listingState.details.openBidsCounter--;
          if (listingState.details.howManyDKeysSold != null) listingState.details.howManyDKeysSold++;
          renderListingContent();
          showError("listing-view-error", "");
          showTxSuccessOverlay(bidAmountInEth);
        } else {
          showError("listing-view-error", (result && result.result) || "Fill bid failed.");
        }
      });
    }).catch(function (e) {
      setListingBusy("");
      showError("listing-view-error", e && e.message ? e.message : "Fill bid failed.");
    });
  }

  function handleDkeyOwnerFillsBid(bidIndex) {
    if (!listingState || !listingState.bids[bidIndex]) return;
    var bid = listingState.bids[bidIndex];
    var profile = window.__dkeyProfile;
    var cfg = getListingConfig();
    var dkey = window.dkeyLib && window.dkeyLib.dkey;
    if (!profile || !cfg || !dkey) return;
    var chainId = listingState.chainId ? parseInt(listingState.chainId, 10) : (listingState.details.chainIds && listingState.details.chainIds[0]);
    var account = wagmi.getAccount(cfg);
    if (!account || account.status !== "connected" || !account.address) {
      showConnectWalletRequiredOverlay();
      return;
    }
    var cidString = listingState.details.cidString || listingState.cid;
    setListingBusy("Sign tx to sell DKEY…");
    ensureSnarkJSLoaded().then(function () {
      return dkey.fetchBidStatus(chainId, bid, cfg);
    }).then(function (status) {
      var amount = status && status[0] != null ? status[0] : BigInt(0);
      if (amount === BigInt(0) || amount === BID_NOT_OPEN_SENTINEL) {
        setListingBusy("");
        listingState.bids.splice(bidIndex, 1);
        if (listingState.details.openBidsCounter != null && listingState.details.openBidsCounter > 0) listingState.details.openBidsCounter--;
        renderListingContent();
        showError("listing-view-error", "Bid not open.");
        return;
      }
      var bidAmountInEthStr = bid.bidAmountInEth != null ? String(bid.bidAmountInEth) : "0";
      return profile.sellDkey(cidString, bid.pubKeyX, bid.pubKeyY, chainId).then(function (result) {
        setListingBusy("");
        if (result && result.success && result.profile) {
          window.__dkeyProfile = result.profile;
          setStoredProfile(result.profile.serialize());
          listingState.bids.splice(bidIndex, 1);
          if (listingState.details.openBidsCounter != null && listingState.details.openBidsCounter > 0) listingState.details.openBidsCounter--;
          if (listingState.details.howManyDKeysSold != null) listingState.details.howManyDKeysSold++;
          renderListingContent();
          showError("listing-view-error", "");
          showTxSuccessOverlay(bidAmountInEthStr);
        } else {
          showError("listing-view-error", (result && result.result) || "Sell DKEY failed.");
        }
      });
    }).catch(function (e) {
      setListingBusy("");
      showError("listing-view-error", e && e.message ? e.message : "Sell DKEY failed.");
    });
  }

  function renderProfilePage(profile) {
    var container = getEl("profile-page");
    if (!container) return;
    var origin = getOrigin();
    var userInfo = profile.userInfo || {};
    var originInfo = (origin && userInfo[origin]) || {};
    var username = originInfo.username || userInfo.username || userInfo.displayName || "—";
    var addresses = profile.addresses || {};
    var myListings = profile.myListings || {};
    var myDKeys = profile.myDKeys || {};
    var myOpenBids = profile.myOpenBids || {};

    var html = [];
    html.push('<p class="profile-section-label">LISTINGs<a href="#" class="profile-link" data-type="create-listing">[➕]</a></p><ul class="profile-list">');
    var listingCount = 0;
    Object.keys(myListings).forEach(function (chainId) {
      var chainListings = myListings[chainId];
      if (chainListings && typeof chainListings === "object") {
        Object.keys(chainListings).forEach(function (cid) {
          var L = chainListings[cid];
          var fileName = (L.metadata && L.metadata.fileName) || L.ipfsCID || cid;
          listingCount++;
          html.push('<li class="profile-bid-item">');
          
          html.push('<a href="#" class="profile-link profile-bid-main" data-action="view" data-type="listing" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '">' + escapeHtml(fileName) + " " + "</a>");
          html.push("<br/>");
          html.push('<span class="profile-bid-actions">');
          html.push('<a href="#" class="profile-link profile-bid-action" data-action="share" data-type="listing" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '"> [SHARE]</a>');
          html.push("</span></li>");
        });
      }
    });
    if (listingCount === 0) html.push("<li>—</li>");
    html.push("</ul>");

    html.push('<p class="profile-section-label">DKEYs<a href="#" class="profile-link" data-action="view-by-cid">[🔎]</a></p><ul class="profile-list">');
    var dkeyCount = 0;
    Object.keys(myDKeys).forEach(function (chainId) {
      var chainDKeys = myDKeys[chainId];
      if (chainDKeys && typeof chainDKeys === "object") {
        Object.keys(chainDKeys).forEach(function (cid) {
          var D = chainDKeys[cid];
          var fileName = D.fileName || D.ipfsCID || cid;
          dkeyCount++;
          html.push('<li><a href="#" class="profile-link" data-type="dkey" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '">' + escapeHtml(fileName) + "</a><br/><span class=\"profile-bid-actions\"><a href=\"#\" class=\"profile-link profile-bid-action\" data-type=\"listing\" data-cid=\"" + escapeAttr(cid) + "\" data-chain-id=\"" + escapeAttr(chainId) + "\"> [SELL]</a></span></li>");
        });
      }
    });
    if (dkeyCount === 0) html.push("<li>—</li>");
    html.push("</ul>");

    html.push('<p class="profile-section-label">OPEN BIDs<a href="#" class="profile-link" data-action="view-by-cid">[🔎]</a></p><ul class="profile-list profile-bids-list">');
    var bidCount = 0;
    Object.keys(myOpenBids).forEach(function (chainId) {
      var chainBids = myOpenBids[chainId];
      if (chainBids && typeof chainBids === "object") {
        Object.keys(chainBids).forEach(function (cid) {
          var B = chainBids[cid];
          var fileName = B.fileName || B.ipfsCID || cid;
          var amountStr = B.bidAmountInEth != null ? (formatBidAmountEth(B.bidAmountInEth) + " ETH") : "—";
          bidCount++;
          html.push('<li class="profile-bid-item">');
          html.push('<a href="#" class="profile-link profile-bid-main" data-type="listing" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '">' + escapeHtml(fileName) + " → " + escapeHtml(amountStr) + "</a>");
          html.push("<br/>");
          html.push('<span class="profile-bid-actions">');
          html.push('<a href="#" class="profile-link profile-bid-action" data-action="increase" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '">[+]</a>');
          html.push("/");
          html.push('<a href="#" class="profile-link profile-bid-action" data-action="reclaim" data-cid="' + escapeAttr(cid) + '" data-chain-id="' + escapeAttr(chainId) + '">[⏎]</a>');
          html.push("</span></li>");
        });
      }
    });
    if (bidCount === 0) html.push("<li>—</li>");
    html.push("</ul>");

    html.push('<p class="profile-section-label">Profile JSON</p>');
    html.push('<textarea id="profile-json-text" class="profile-json-text" readonly rows="8"></textarea>');

    container.innerHTML = html.join("");
    var jsonText = getEl("profile-json-text");
    if (jsonText) {
      try {
        jsonText.value = typeof profile.serialize === "function" ? profile.serialize() : "";
      } catch (e) {
        jsonText.value = "";
      }
    }
    container.querySelectorAll(".profile-link").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var action = a.getAttribute("data-action");
        var cid = a.getAttribute("data-cid");
        var chainId = a.getAttribute("data-chain-id");
        if (action === "reclaim" && cid && chainId) {
          connectForChainThen(parseInt(chainId, 10), function () { showReclaimBidOverlay(cid, chainId); });
          return;
        }
        if (action === "increase" && cid && chainId) {
          connectForChainThen(parseInt(chainId, 10), function () { showIncreaseBidOverlay(cid, chainId); });
          return;
        }
        if (action === "view" && cid && typeof window.onProfileItemClick === "function") {
          window.onProfileItemClick("listing", cid, chainId);
          return;
        }
        if (action === "share" && cid && chainId) {
          showShareListingOverlay(cid, chainId);
          return;
        }
        if (action === "view-by-cid") {
          showViewListingByCidOverlay();
          return;
        }
        var type = a.getAttribute("data-type");
        if (type === "create-listing") {
          if (typeof showCreateListingView === "function") showCreateListingView();
        } else if (typeof window.onProfileItemClick === "function") {
          window.onProfileItemClick(type, cid, chainId);
        }
      });
    });
  }

  var reclaimBidContext = null;
  var increaseBidContext = null;

  function showReclaimBidOverlay(cid, chainId) {
    var chainIdNum = parseInt(chainId, 10);
    var profile = window.__dkeyProfile;
    var bidInfo = profile && profile.myOpenBids && profile.myOpenBids[chainIdNum] && profile.myOpenBids[chainIdNum][cid];
    var amount = bidInfo && bidInfo.bidAmountInEth != null ? String(bidInfo.bidAmountInEth) : null;
    reclaimBidContext = { cid: cid, chainId: chainIdNum, amount: amount };
    show(getEl("reclaim-bid-overlay"));
  }

  function showIncreaseBidOverlay(cid, chainId) {
    increaseBidContext = { cid: cid, chainId: parseInt(chainId, 10) };
    var input = getEl("increase-bid-amount");
    if (input) {
      input.value = "";
      input.placeholder = "e.g. 0.01";
    }
    show(getEl("increase-bid-overlay"));
    if (input) input.focus();
  }

  function hideReclaimBidOverlay() {
    reclaimBidContext = null;
    hide(getEl("reclaim-bid-overlay"));
  }

  function hideIncreaseBidOverlay() {
    increaseBidContext = null;
    hide(getEl("increase-bid-overlay"));
  }

  var MIN_BID_ETH = 0.000001;

  function ensureWalletConnectedForChainThen(profile, config, chainId, onConnected) {
    if (!config) return;
    var account = wagmi.getAccount(config);
    if (account && account.status === "connected" && account.chainId === chainId) {
      if (typeof onConnected === "function") onConnected();
      return;
    }
    showConnectWalletRequiredOverlay();
  }

  function connectForChainThen(chainId, onConnected) {
    var profile = window.__dkeyProfile;
    var config = getListingConfig();
    if (!config) {
      if (typeof onConnected === "function") onConnected();
      return;
    }
    ensureWalletConnectedForChainThen(profile, config, chainId, onConnected);
  }

  function hideProfileChainOverlay() {
    hide(getEl("profile-chain-overlay"));
  }

  function buildListingShareUrl(cid, chainId) {
    var base = typeof window !== "undefined" && window.location ? (window.location.origin + (window.location.pathname || "/")) : "";
    return base + "?listing=" + encodeURIComponent(cid) + (chainId ? "&chainId=" + encodeURIComponent(chainId) : "");
  }

  function showShareListingOverlay(cid, chainId) {
    var urlInput = getEl("share-listing-url");
    if (urlInput) urlInput.value = buildListingShareUrl(cid, chainId);
    show(getEl("share-listing-overlay"));
  }

  function hideShareListingOverlay() {
    hide(getEl("share-listing-overlay"));
  }

  function showViewListingByCidOverlay() {
    var overlay = getEl("view-listing-by-cid-overlay");
    var input = getEl("view-listing-by-cid-input");
    if (overlay) show(overlay);
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function hideViewListingByCidOverlay() {
    hide(getEl("view-listing-by-cid-overlay"));
  }

  function formatEthForDisplay(val) {
    var num = parseFloat(String(val || "0"), 10) || 0;
    return num.toFixed(6).replace(/\.?0+$/, "") || "0";
  }

  function showTxSuccessOverlay(bidAmountEthStr) {
    var num = parseFloat(String(bidAmountEthStr || "0"), 10) || 0;
    var received = num * 0.99;
    var formatted = (typeof received === "number" ? received.toFixed(18) : String(received)).replace(/\.?0+$/, "") || "0";
    var msgEl = getEl("tx-success-message");
    if (msgEl) msgEl.textContent = "You just received +" + formatted + " ETH.";
    show(getEl("tx-success-overlay"));
  }

  function showTxSuccessOverlayWithMessage(message) {
    var msgEl = getEl("tx-success-message");
    if (msgEl) msgEl.textContent = message || "Done.";
    show(getEl("tx-success-overlay"));
  }

  function hideTxSuccessOverlay() {
    hide(getEl("tx-success-overlay"));
  }

  function showConnectWalletRequiredOverlay() {
    show(getEl("connect-wallet-required-overlay"));
  }

  function hideConnectWalletRequiredOverlay() {
    hide(getEl("connect-wallet-required-overlay"));
  }

  function wireProfileChainOverlay() {
    var overlay = getEl("profile-chain-overlay");
    if (!overlay) return;
    var configSetupEl = getEl("config-setup");
    overlay.querySelectorAll(".profile-chain-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var chainId = parseInt(btn.getAttribute("data-chain-id"), 10);
        if (isNaN(chainId)) return;
        var profile = window.__dkeyProfile;
        var config = (configSetupEl && !configSetupEl.classList.contains("hidden") && window.__configSetupConfig)
          ? window.__configSetupConfig
          : getListingConfig();
        if (!profile || !config) return;
        hideProfileChainOverlay();
        showError("header-connect-error", "");
        connectWalletForChain(profile, config, chainId, function () {
          renderProfilePage(window.__dkeyProfile);
          updateAppHeader(window.__dkeyProfile, "profile");
          if (typeof window.__configSetupRefresh === "function") window.__configSetupRefresh(chainId);
        }, function (err) {
          showError("header-connect-error", err || "Connection failed.");
        });
      });
    });
    var backdrop = overlay.querySelector(".overlay-backdrop[data-dismiss=\"profile-chain-overlay\"]");
    if (backdrop) backdrop.addEventListener("click", hideProfileChainOverlay);
  }

  function wireShareListingOverlay() {
    var overlay = getEl("share-listing-overlay");
    if (!overlay) return;
    var copyBtn = getEl("share-listing-copy");
    var dismissBtn = getEl("share-listing-dismiss");
    var urlInput = getEl("share-listing-url");
    if (copyBtn && urlInput) {
      copyBtn.addEventListener("click", function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(urlInput.value).catch(function () {
              urlInput.select();
            });
          } else {
            urlInput.select();
          }
        } catch (e) {
          urlInput.select();
        }
      });
    }
    if (dismissBtn) dismissBtn.addEventListener("click", hideShareListingOverlay);
    var backdrop = overlay.querySelector(".overlay-backdrop[data-dismiss=\"share-listing-overlay\"]");
    if (backdrop) backdrop.addEventListener("click", hideShareListingOverlay);
  }

  function wireTxSuccessOverlay() {
    var okBtn = getEl("tx-success-ok");
    var overlay = getEl("tx-success-overlay");
    if (okBtn) okBtn.addEventListener("click", hideTxSuccessOverlay);
    if (overlay) {
      var backdrop = overlay.querySelector(".overlay-backdrop[data-dismiss=\"tx-success-overlay\"]");
      if (backdrop) backdrop.addEventListener("click", hideTxSuccessOverlay);
    }
  }

  function wireConnectWalletRequiredOverlay() {
    var okBtn = getEl("connect-wallet-required-ok");
    var overlay = getEl("connect-wallet-required-overlay");
    if (okBtn) okBtn.addEventListener("click", hideConnectWalletRequiredOverlay);
    if (overlay) {
      var backdrop = overlay.querySelector(".overlay-backdrop[data-dismiss=\"connect-wallet-required-overlay\"]");
      if (backdrop) backdrop.addEventListener("click", hideConnectWalletRequiredOverlay);
    }
  }

  function wireViewListingByCidOverlay() {
    var okBtn = getEl("view-listing-by-cid-ok");
    var overlay = getEl("view-listing-by-cid-overlay");
    var input = getEl("view-listing-by-cid-input");
    if (okBtn && input) {
      okBtn.addEventListener("click", function () {
        var cid = input.value.trim();
        if (!cid) return;
        var profile = window.__dkeyProfile;
        var chainId = profile ? getDefaultChainId(profile) : null;
        if (window.history && window.history.replaceState) {
          var url = (window.location.pathname || "/") + "?listing=" + encodeURIComponent(cid) + (chainId ? "&chainId=" + encodeURIComponent(chainId) : "");
          if (window.location.hash) url += window.location.hash;
          window.history.replaceState(null, "", url);
        }
        hideViewListingByCidOverlay();
        showListingView(cid, chainId);
      });
    }
    if (overlay) {
      var backdrop = overlay.querySelector(".overlay-backdrop[data-dismiss=\"view-listing-by-cid-overlay\"]");
      if (backdrop) backdrop.addEventListener("click", hideViewListingByCidOverlay);
    }
  }

  function wireBidOverlays() {
    var reclaimConfirm = getEl("reclaim-bid-confirm");
    var reclaimCancel = getEl("reclaim-bid-cancel");
    var increaseConfirm = getEl("increase-bid-confirm");
    var increaseCancel = getEl("increase-bid-cancel");
    if (reclaimConfirm) {
      reclaimConfirm.onclick = function () {
        showError("reclaim-bid-error", "");
        var ctx = reclaimBidContext;
        if (!ctx) { hideReclaimBidOverlay(); return; }
        var profile = window.__dkeyProfile;
        if (!profile || typeof profile.reclaimBid !== "function") {
          showError("reclaim-bid-error", "Profile not loaded.");
          return;
        }
        profile.reclaimBid(ctx.cid, ctx.chainId).then(function (result) {
          if (result && result.success && result.profile) {
            window.__dkeyProfile = result.profile;
            setStoredProfile(result.profile.serialize());
            hideReclaimBidOverlay();
            renderProfilePage(result.profile);
            var msg = ctx.amount != null
              ? "You received back +" + formatEthForDisplay(ctx.amount) + " ETH."
              : "You received your bid back.";
            showTxSuccessOverlayWithMessage(msg);
          } else {
            showError("reclaim-bid-error", (result && result.result) || "Reclaim failed.");
          }
        }).catch(function (e) {
          showError("reclaim-bid-error", e && e.message ? e.message : "Reclaim failed.");
        });
      };
    }
    if (reclaimCancel) reclaimCancel.onclick = hideReclaimBidOverlay;

    if (increaseConfirm) {
      increaseConfirm.onclick = function () {
        showError("increase-bid-error", "");
        var ctx = increaseBidContext;
        if (!ctx) { hideIncreaseBidOverlay(); return; }
        var amountEl = getEl("increase-bid-amount");
        var amountStr = amountEl ? amountEl.value.trim() : "";
        var amount = parseFloat(amountStr, 10);
        if (isNaN(amount) || amount < MIN_BID_ETH) {
          showError("increase-bid-error", "Enter at least " + MIN_BID_ETH + " ETH.");
          return;
        }
        var profile = window.__dkeyProfile;
        if (!profile || typeof profile.updateBid !== "function") {
          showError("increase-bid-error", "Profile not loaded.");
          return;
        }
        profile.updateBid(ctx.cid, ctx.chainId, amount).then(function (result) {
          if (result && result.success && result.profile) {
            window.__dkeyProfile = result.profile;
            setStoredProfile(result.profile.serialize());
            hideIncreaseBidOverlay();
            renderProfilePage(result.profile);
            showTxSuccessOverlayWithMessage("Your bid was increased by +" + formatEthForDisplay(amount) + " ETH.");
          } else {
            showError("increase-bid-error", (result && result.result) || "Increase bid failed.");
          }
        }).catch(function (e) {
          showError("increase-bid-error", e && e.message ? e.message : "Increase bid failed.");
        });
      };
    }
    if (increaseCancel) increaseCancel.onclick = hideIncreaseBidOverlay;

    document.querySelectorAll(".overlay-backdrop[data-dismiss]").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-dismiss");
        if (id === "reclaim-bid-overlay") hideReclaimBidOverlay();
        else if (id === "increase-bid-overlay") hideIncreaseBidOverlay();
        else if (id === "tx-success-overlay") hideTxSuccessOverlay();
        else if (id === "connect-wallet-required-overlay") hideConnectWalletRequiredOverlay();
        else if (id === "view-listing-by-cid-overlay") hideViewListingByCidOverlay();
      });
    });
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function createNewProfile() {
    if (!DkeyUserProfile) {
      showError("landing-message", "dkey-lib not loaded.");
      return;
    }
    try {
      var profile = new DkeyUserProfile(
        {},
        {},
        {},
        {},
        {},
        config
      );
      setProfile(profile);
    } catch (e) {
      showError("landing-message", "Failed to create profile: " + (e && e.message));
    }
  }

  function loadPastedProfile() {
    if (!DkeyUserProfile) {
      showError("landing-paste-error", "dkey-lib not loaded.");
      return;
    }
    var ta = getEl("landing-paste-input");
    var raw = (ta && ta.value) ? ta.value.trim() : "";
    showError("landing-paste-error", "");
    if (!raw) {
      showError("landing-paste-error", "Paste JSON first.");
      return;
    }
    try {
      var profile = DkeyUserProfile.deserialize(raw, config);
      setProfile(profile);
    } catch (e) {
      showError("landing-paste-error", "Invalid profile JSON: " + (e && e.message));
    }
  }

  function decryptAndLoadFile() {
    if (!DkeyUserProfile) {
      showError("landing-file-error", "dkey-lib not loaded.");
      return;
    }
    var fileInput = getEl("landing-file-input");
    var passwordInput = getEl("landing-file-password");
    var file = fileInput && fileInput.files && fileInput.files[0];
    var password = passwordInput ? passwordInput.value : "";
    showError("landing-file-error", "");
    if (!file) {
      showError("landing-file-error", "Select a .enc file first.");
      return;
    }
    if (!password) {
      showError("landing-file-error", "Enter the password.");
      return;
    }
    DkeyUserProfile.fromEncryptedProfileData(file, password, config)
      .then(function (profile) {
        setProfile(profile);
      })
      .catch(function (e) {
        showError("landing-file-error", "Decrypt failed: " + (e && e.message));
      });
  }

  function getStoredProfileJson() {
    try {
      return sessionStorage.getItem("dkey_profile_json") || (typeof localStorage !== "undefined" && localStorage.getItem("dkey_profile_json")) || null;
    } catch (e) {
      return sessionStorage.getItem("dkey_profile_json") || null;
    }
  }

  function setStoredProfile(json) {
    try {
      sessionStorage.setItem("dkey_profile_json", json);
      if (typeof localStorage !== "undefined") localStorage.setItem("dkey_profile_json", json);
    } catch (e) {
      sessionStorage.setItem("dkey_profile_json", json);
    }
  }

  function getStoredProfileUsername() {
    var origin = getOrigin();
    var saved = getStoredProfileJson();
    if (!saved) return null;
    try {
      var parsed = JSON.parse(saved);
      var userInfo = parsed && parsed.userInfo;
      if (!userInfo) return null;
      var originInfo = userInfo[origin];
      var name = originInfo && originInfo.username;
      if (name && String(name).trim()) return String(name).trim();
      var firstOrigin = Object.keys(userInfo)[0];
      name = firstOrigin && userInfo[firstOrigin] && userInfo[firstOrigin].username;
      return (name && String(name).trim()) ? String(name).trim() : null;
    } catch (e) {
      return null;
    }
  }

  function hasStoredProfile() {
    return !!getStoredProfileJson();
  }

  function tryRestoreFromStorage() {
    var origin = getOrigin();
    var saved = getStoredProfileJson();
    if (!saved || !DkeyUserProfile) return null;
    try {
      var parsed = JSON.parse(saved);
      var savedConfigPrefs = parsed && parsed.userInfo && parsed.userInfo[origin] && parsed.userInfo[origin].config;
      var profile;
      var hasValidPrefs = savedConfigPrefs && savedConfigPrefs.rpcUrls && (savedConfigPrefs.defaultChainId != null || (savedConfigPrefs.chainIds && savedConfigPrefs.chainIds.length));
      if (hasValidPrefs) {
        var built = buildConfigFromPrefs(savedConfigPrefs);
        profile = DkeyUserProfile.deserialize(saved, built);
        window.__dkeyProfile = profile;
      } else {
        profile = DkeyUserProfile.deserialize(saved, config);
        window.__dkeyProfile = profile;
      }
      setStoredProfile(saved);
      return profile;
    } catch (e) {
      try {
        sessionStorage.removeItem("dkey_profile_json");
        if (typeof localStorage !== "undefined") localStorage.removeItem("dkey_profile_json");
      } catch (err) {}
      return null;
    }
  }

  function showLandingOptions() {
    hide(getEl("storage-prompt"));
    show(getEl("landing"));
    hide(getEl("terminal-wrap"));
    var configSetup = getEl("config-setup");
    if (configSetup) hide(configSetup);
  }

  function initLanding() {
    var landing = getEl("landing");
    var terminalWrap = getEl("terminal-wrap");
    var configSetup = getEl("config-setup");
    var storagePrompt = getEl("storage-prompt");
    if (!landing || !terminalWrap) return;

    hide(landing);
    hide(terminalWrap);
    if (configSetup) hide(configSetup);

    if (hasStoredProfile() && storagePrompt) {
      var username = getStoredProfileUsername();
      var usernameEl = getEl("storage-prompt-username");
      if (usernameEl) {
        usernameEl.textContent = username ? username + "'s" : "your saved";
        usernameEl.className = username ? "storage-prompt-username" : "";
      }
      show(storagePrompt);
    } else {
      hide(storagePrompt);
      showLandingOptions();
    }

    getEl("storage-prompt-yes").onclick = function () {
      showError("storage-prompt-error", "");
      var profile = tryRestoreFromStorage();
      if (profile) {
        hide(storagePrompt);
        ensureConfigThenGoToTerminal(profile);
        return;
      }
      showError("landing-message", "No profile in storage.");
      showLandingOptions();
    };

    getEl("storage-prompt-no").onclick = function () {
      showError("storage-prompt-error", "");
      showLandingOptions();
    };

    getEl("landing-new").addEventListener("click", createNewProfile);

    getEl("landing-paste-toggle").addEventListener("click", function () {
      var area = getEl("landing-paste-area");
      area.classList.toggle("hidden", !area.classList.contains("hidden"));
      showError("landing-paste-error", "");
    });
    getEl("landing-paste-submit").addEventListener("click", loadPastedProfile);

    var fileInput = getEl("landing-file-input");
    var fileArea = getEl("landing-file-area");
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files.length) show(fileArea);
      else hide(fileArea);
      showError("landing-file-error", "");
    });
    getEl("landing-file-decrypt").addEventListener("click", decryptAndLoadFile);

    var headerBackBtn = getEl("header-action-btn");
    if (headerBackBtn) {
      headerBackBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var viewFileView = getEl("view-file-view");
        var listingView = getEl("listing-view");
        var createView = getEl("create-listing-view");
        if (viewFileView && !viewFileView.classList.contains("hidden")) hideViewFile();
        else if (listingView && !listingView.classList.contains("hidden")) hideListingView();
        else if (createView && !createView.classList.contains("hidden")) hideCreateListingView();
      });
    }
    var headerGearBtn = getEl("header-gear-btn");
    if (headerGearBtn) {
      headerGearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        hide(terminalWrap);
        if (configSetup) {
          show(configSetup);
          var profile = window.__dkeyProfile;
          if (profile) showConfigSetup(profile);
        }
      });
    }

    window.onProfileItemClick = function (type, cid, chainId) {
      if (type === "listing" && cid) showListingView(cid, chainId);
      if (type === "dkey" && cid) showViewFile(cid, chainId);
    };

    wireBidOverlays();
    wireProfileChainOverlay();
    wireShareListingOverlay();
    wireTxSuccessOverlay();
    wireConnectWalletRequiredOverlay();
    wireViewListingByCidOverlay();
    wireViewFileDownload();
  }

  function wireViewFileDownload() {
    var downloadLink = getEl("view-file-download");
    if (!downloadLink) return;
    downloadLink.addEventListener("click", function (e) {
      e.preventDefault();
      var fd = viewFileState.fileData;
      var fn = viewFileState.fileName;
      if (!fd || !fn) return;
      var blob = new Blob([fd]);
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = fn;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function run() {
    var lib = (typeof window !== "undefined" && window.dkeyLib) || null;
    DkeyUserProfile = (lib && lib.DkeyUserProfile) || (lib && lib.default && lib.default.DkeyUserProfile) || null;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initLanding);
    } else {
      initLanding();
    }
  }

  run();
})();
