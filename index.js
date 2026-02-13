/**
 * Entry: landing (profile setup) and transition to terminal.
 * Imports dkey-lib for DkeyUserProfile (create, deserialize, fromEncryptedProfileData).
 */

(function () {
  var DkeyUserProfile = null;
  var config = {}; // minimal wagmi config placeholder for profile load

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

  function setProfile(profile) {
    try {
      var json = profile.serialize();
      sessionStorage.setItem("dkey_profile_json", json);
      window.__dkeyProfile = profile;
      goToTerminal();
    } catch (e) {
      showError("landing-message", "Failed to save profile: " + (e && e.message));
    }
  }

  function goToTerminal() {
    hide(getEl("landing"));
    show(getEl("terminal-wrap"));
    if (typeof window.terminalReady === "function") window.terminalReady();
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

  function initLanding() {
    var landing = getEl("landing");
    var terminalWrap = getEl("terminal-wrap");
    if (!landing || !terminalWrap) return;

    // Restore profile from session and skip landing if present
    var saved = sessionStorage.getItem("dkey_profile_json");
    if (saved) {
      try {
        if (DkeyUserProfile) {
          window.__dkeyProfile = DkeyUserProfile.deserialize(saved, config);
          goToTerminal();
          return;
        }
      } catch (e) {
        sessionStorage.removeItem("dkey_profile_json");
      }
    }

    show(landing);
    hide(terminalWrap);

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
