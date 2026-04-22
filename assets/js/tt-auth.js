(function () {
  function getClient() {
    if (!window.ttSupabase) {
      throw new Error("Supabase client not loaded.");
    }
    return window.ttSupabase;
  }

  function getRoleLabel(role) {
    if (role === "admin") return "Admin";
    if (role === "reviewer") return "Reviewer";
    return "View Only";
  }

  function getFirstName(fullName) {
    if (!fullName || typeof fullName !== "string") return "User";
    return fullName.trim().split(" ")[0] || "User";
  }

  async function signOutAndRedirect() {
    const client = getClient();
    await client.auth.signOut();
    window.location.href = "/login.html";
  }

  async function requireTTUser(options = {}) {
    const client = getClient();

    const {
      welcomeTextId = null,
      adminNavLinkId = null,
      loginPath = "/login.html"
    } = options;

    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError || !sessionData.session) {
      window.location.href = loginPath;
      return null;
    }

    const user = sessionData.session.user;
    const email = (user.email || "").toLowerCase();

    if (!email.endsWith("@timtaylors.co.uk")) {
      await client.auth.signOut();
      window.location.href = loginPath;
      return null;
    }

    const { data: profile, error: profileError } = await client
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      alert("TT user profile not found.");
      await signOutAndRedirect();
      return null;
    }

    if (profile.is_active === false) {
      alert("Your account has been deactivated. Please contact an administrator.");
      await signOutAndRedirect();
      return null;
    }

    if (welcomeTextId) {
      const welcomeEl = document.getElementById(welcomeTextId);
      if (welcomeEl) {
        const firstName = getFirstName(profile.full_name);
        const roleLabel = getRoleLabel(profile.role);
        welcomeEl.textContent = `Welcome, ${firstName} — ${roleLabel}`;
      }
    }

    if (adminNavLinkId) {
      const adminNavEl = document.getElementById(adminNavLinkId);
      if (adminNavEl) {
        adminNavEl.style.display = profile.role === "admin" ? "block" : "none";
      }
    }

    return {
      client,
      user,
      profile,
      roleLabel: getRoleLabel(profile.role),
      isAdmin: profile.role === "admin",
      isReviewer: profile.role === "reviewer",
      canReview: profile.role === "admin" || profile.role === "reviewer"
    };
  }

  window.ttAuth = {
    getClient,
    requireTTUser,
    signOutAndRedirect
  };
})();
