const state = {
  token: localStorage.getItem("forma_access_token"),
  user: null,
  products: [],
  categories: [],
  cart: [],
  authMode: "login",
  activeView: "overview",
  productSearchTimer: null,
};

const palettes = [
  ["#edf0e8", "#73836a", "◉"],
  ["#f5ece4", "#bd8e69", "◌"],
  ["#edeaf3", "#877aa7", "✳"],
  ["#e8eef0", "#668391", "⌑"],
  ["#f4edeb", "#ac786e", "◇"],
  ["#edf1e5", "#8b986e", "⬡"],
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function toast(message, kind = "success") {
  const item = document.createElement("div");
  item.className = `toast ${kind}`;
  item.textContent = message;
  $("#toast-region").append(item);
  window.setTimeout(() => item.remove(), 3600);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Could not reach the API. Check that the backend is running.");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? payload.detail
        : payload;
    if (response.status === 401 && state.token) {
      state.token = null;
      state.user = null;
      localStorage.removeItem("forma_access_token");
      updateAccount();
    }
    throw new Error(
      typeof detail === "string" ? detail : `Request failed (${response.status})`,
    );
  }
  return payload;
}

function updateAccount() {
  const signedIn = Boolean(state.user && state.token);
  $("#account-name").textContent = signedIn ? state.user.full_name : "Guest account";
  $("#account-role").textContent = signedIn
    ? state.user.role === "admin"
      ? "Administrator"
      : "Customer account"
    : "Sign in to shop";
  $("#account-avatar").textContent = signedIn
    ? state.user.full_name.trim().charAt(0).toUpperCase() || "A"
    : "G";
  $$(".admin-only").forEach((element) =>
    element.classList.toggle("hidden", !signedIn || state.user.role !== "admin"),
  );
  if (state.activeView === "admin" && (!signedIn || state.user.role !== "admin")) {
    navigate("overview");
  }
  renderCartCount();
}

function navigate(view) {
  if (!$("#view-" + view)) return;
  state.activeView = view;
  $$(".view").forEach((section) =>
    section.classList.toggle("active", section.id === `view-${view}`),
  );
  $$(".nav-link").forEach((link) =>
    link.classList.toggle("active", link.dataset.view === view),
  );
  $("#page-crumb").textContent =
    $(`.nav-link[data-view="${view}"]`)?.textContent.trim() || "Overview";
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const loaders = {
    shop: loadProducts,
    cart: loadCart,
    orders: loadOrders,
    account: loadAccount,
    admin: loadAdminTab,
  };
  if (loaders[view]) loaders[view]();
}

async function checkHealth() {
  const dots = [$("#sidebar-dot"), $("#topbar-dot")];
  try {
    const result = await api("/health");
    dots.forEach((dot) => dot.classList.add("is-online"));
    dots.forEach((dot) => dot.classList.remove("is-offline"));
    $("#sidebar-api-status").textContent = "Connected and ready";
    $("#topbar-status").textContent = "API connected";
    $("#health-pulse").className = "health-pulse is-online";
    $("#health-title").textContent = "All systems feeling good";
    $("#health-detail").textContent = "The API and database are responding.";
    $("#health-backend").textContent = "Online";
    $("#health-database").textContent =
      result.database === "connected" ? "Connected" : "Unavailable";
    $("#health-database").style.color =
      result.database === "connected" ? "#62834f" : "#a36459";
  } catch (error) {
    dots.forEach((dot) => dot.classList.add("is-offline"));
    dots.forEach((dot) => dot.classList.remove("is-online"));
    $("#sidebar-api-status").textContent = "API unavailable";
    $("#topbar-status").textContent = "API unavailable";
    $("#health-pulse").className = "health-pulse is-offline";
    $("#health-title").textContent = "We can’t reach the API";
    $("#health-detail").textContent = error.message;
    $("#health-backend").textContent = "Unavailable";
    $("#health-database").textContent = "Not checked";
  }
}

async function loadDashboard() {
  try {
    const [products, categories] = await Promise.all([
      api("/products?limit=100"),
      api("/categories"),
    ]);
    $("#stat-products").textContent = products.length;
    $("#stat-categories").textContent = categories.length;
  } catch {
    $("#stat-products").textContent = "—";
    $("#stat-categories").textContent = "—";
  }
  if (state.user) {
    try {
      const orders = await api("/orders?limit=100");
      $("#stat-orders").textContent = orders.length;
    } catch {
      $("#stat-orders").textContent = "—";
    }
  } else {
    $("#stat-orders").textContent = "—";
  }
}

async function loadProfile() {
  if (!state.token) {
    state.user = null;
    updateAccount();
    return;
  }
  try {
    state.user = await api("/users/me");
  } catch {
    state.user = null;
  }
  updateAccount();
}

function renderAccount() {
  const signedIn = Boolean(state.user);
  $("#profile-guest").classList.toggle("hidden", signedIn);
  $("#profile-form").classList.toggle("hidden", !signedIn);
  $("#profile-signout").classList.toggle("hidden", !signedIn);
  $("#profile-display-name").textContent = signedIn
    ? state.user.full_name
    : "Guest account";
  $("#profile-display-role").textContent = signedIn
    ? state.user.role === "admin"
      ? "Administrator account"
      : "Customer account"
    : "Sign in to manage your profile";
  $("#profile-avatar").textContent = signedIn
    ? state.user.full_name.trim().charAt(0).toUpperCase() || "A"
    : "G";
  if (signedIn) {
    $("#profile-form").elements.full_name.value = state.user.full_name;
    $("#profile-form").elements.email.value = state.user.email;
    $("#profile-form").elements.mobile.value = state.user.mobile;
    $("#profile-form").elements.role.value = state.user.role;
  }
}

async function loadAccount() {
  renderAccount();
}

async function loadCategories() {
  try {
    state.categories = await api("/categories");
    const options = state.categories
      .map(
        (category) =>
          `<option value="${category.id}">${escapeHtml(category.name)}</option>`,
      )
      .join("");
    $("#category-filter").innerHTML =
      '<option value="">All collections</option>' + options;
    $("#admin-product-category").innerHTML =
      '<option value="">Choose a collection…</option>' + options;
  } catch (error) {
    state.categories = [];
    toast(error.message, "error");
  }
}

function productCard(product, index) {
  const [background, ink, glyph] = palettes[index % palettes.length];
  const category = state.categories.find(
    (item) => item.id === product.category_id,
  );
  const description = product.description || "A lovely new addition to the collection.";
  return `<article class="product-card">
    <div class="product-art" style="--product-bg:${background};--product-ink:${ink}">
      <span class="product-collection">${escapeHtml(category?.name || "Collection")}</span>
      <span class="product-glyph" aria-hidden="true">${glyph}</span>
      <span class="product-id">NO. ${String(product.id).padStart(3, "0")}</span>
    </div>
    <div class="product-info">
      <h3 title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="product-bottom">
        <div><span class="product-price">${money(product.price)}</span><span class="product-stock">${product.stock > 0 ? `${product.stock} available` : "Currently unavailable"}</span></div>
        <button class="product-add" data-add-product="${product.id}" aria-label="Add ${escapeHtml(product.name)} to cart" ${product.stock < 1 ? "disabled" : ""}>+</button>
      </div>
    </div>
  </article>`;
}

async function loadProducts() {
  const grid = $("#product-grid");
  const empty = $("#products-empty");
  const errorState = $("#products-error");
  empty.classList.add("hidden");
  errorState.classList.add("hidden");
  grid.innerHTML = '<div class="loading-note">Gathering the good things…</div>';
  const params = new URLSearchParams();
  const query = $("#product-search").value.trim();
  const category = $("#category-filter").value;
  if (query) params.set("q", query);
  if (category) params.set("category_id", category);
  params.set("limit", "100");
  try {
    state.products = await api(`/products?${params.toString()}`);
    $("#product-count").textContent = `${state.products.length} ${state.products.length === 1 ? "piece" : "pieces"}`;
    grid.innerHTML = state.products.map(productCard).join("");
    if (state.products.length === 0) {
      grid.innerHTML = "";
      empty.classList.remove("hidden");
    }
  } catch (error) {
    grid.innerHTML = "";
    $("#products-error-detail").textContent = error.message;
    errorState.classList.remove("hidden");
    $("#product-count").textContent = "Catalog unavailable";
  }
}

function renderCartCount() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $("#cart-count").textContent = count;
  $("#cart-count").classList.toggle("hidden", count === 0);
}

function renderCart() {
  const container = $("#cart-items");
  const empty = $("#cart-empty");
  const signedIn = Boolean(state.user);
  if (!signedIn) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("strong").textContent = "Sign in to keep your cart";
    empty.querySelector("p").textContent =
      "Your personal cart is saved to your customer account. Sign in or create an account to get started.";
    empty.querySelector("button").textContent = "Sign in or create account →";
    empty.querySelector("button").dataset.openAuth = "true";
    $("#cart-heading").textContent = "Your personal cart";
    $("#clear-cart").classList.add("hidden");
    $("#checkout-button").disabled = true;
    $("#cart-subtotal").textContent = money(0);
    $("#cart-total").textContent = money(0);
    return;
  }
  empty.querySelector("button").dataset.openAuth = "";
  $("#cart-heading").textContent = "Your selected pieces";
  $("#checkout-button").disabled = state.cart.length === 0;
  $("#clear-cart").classList.toggle("hidden", state.cart.length === 0);
  empty.classList.toggle("hidden", state.cart.length > 0);
  container.innerHTML = state.cart
    .map(
      (item) => `<div class="cart-line">
        <div class="cart-thumb">${escapeHtml(item.name.trim().charAt(0).toUpperCase())}</div>
        <div><div class="cart-product-name">${escapeHtml(item.name)}</div><div class="cart-product-note">${money(item.unit_price)} each · ${money(item.line_total)} total</div></div>
        <div class="quantity-control"><button data-quantity="-1" data-product-id="${item.product_id}" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button data-quantity="1" data-product-id="${item.product_id}" aria-label="Increase quantity">+</button></div>
        <div class="cart-line-total">${money(item.line_total)}</div>
        <button class="remove-item" data-remove-cart="${item.product_id}" aria-label="Remove ${escapeHtml(item.name)}">×</button>
      </div>`,
    )
    .join("");
  const subtotal = state.cart.reduce((sum, item) => sum + item.line_total, 0);
  $("#cart-subtotal").textContent = money(subtotal);
  $("#cart-total").textContent = money(subtotal);
}

async function loadCart() {
  if (!state.user) {
    state.cart = [];
    renderCartCount();
    renderCart();
    return;
  }
  try {
    state.cart = await api("/cart");
    renderCartCount();
    renderCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function addToCart(productId) {
  if (!state.user) {
    showAuth("register");
    toast("Create an account or sign in to save your cart.", "error");
    return;
  }
  try {
    await api("/cart/items", {
      method: "POST",
      body: JSON.stringify({ product_id: Number(productId), quantity: 1 }),
    });
    toast("Added to your cart.");
    await loadCart();
    await loadProducts();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function updateCartQuantity(productId, delta) {
  const item = state.cart.find((entry) => entry.product_id === Number(productId));
  if (!item) return;
  try {
    if (item.quantity + delta < 1) {
      await api(`/cart/items/${productId}`, { method: "DELETE" });
    } else {
      await api(`/cart/items/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: item.quantity + delta }),
      });
    }
    await loadCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function removeCartItem(productId) {
  try {
    await api(`/cart/items/${productId}`, { method: "DELETE" });
    await loadCart();
    toast("Removed from your cart.");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function checkout() {
  if (!state.user) {
    showAuth("login");
    return;
  }
  const button = $("#checkout-button");
  button.disabled = true;
  try {
    const order = await api("/orders/checkout", { method: "POST" });
    toast(`Order #${order.id} is in! This is a demo — no payment was taken.`);
    state.cart = [];
    renderCart();
    renderCartCount();
    await Promise.all([loadDashboard(), loadProducts()]);
    navigate("orders");
  } catch (error) {
    toast(error.message, "error");
    button.disabled = state.cart.length === 0;
    await loadCart();
  }
}

function renderOrders(orders, container, isAdmin = false) {
  if (!orders.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = orders
    .map((order) => {
      const items = (order.items || [])
        .map(
          (item) =>
            `${item.quantity} × Product #${item.product_id} · ${money(item.price)} each`,
        )
        .map(escapeHtml)
        .join("<br>");
      const next = {
        pending: "processing",
        processing: "shipped",
        shipped: "delivered",
      }[order.status];
      const controls = isAdmin
        ? next
          ? `<button class="small-button" data-next-status="${next}" data-order-id="${order.id}">Mark ${next} →</button>`
          : ""
        : order.status === "pending"
          ? `<button class="small-button" data-cancel-order="${order.id}">Cancel order</button>`
          : "";
      const customer = isAdmin
        ? `<span class="order-date">Customer #${order.user_id}</span>`
        : "";
      const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "";
      return `<article class="order-card">
        <div class="order-card-top"><div><div class="order-id">Order #${order.id}</div><div class="order-date">${escapeHtml(orderDate)} ${customer}</div></div><span class="order-status ${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div>
        <div class="order-items">${items || "No order items"}</div>
        <div class="order-card-bottom"><strong class="order-total">${money(order.total_amount)}</strong><div class="order-actions">${controls}</div></div>
      </article>`;
    })
    .join("");
}

async function loadOrders() {
  const container = $("#orders-list");
  const empty = $("#orders-empty");
  if (!state.user) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("strong").textContent = "Sign in to follow your orders";
    empty.querySelector("p").textContent =
      "Your order history is private to your account. Sign in or create an account to see it here.";
    empty.querySelector("button").textContent = "Sign in or create account →";
    empty.querySelector("button").dataset.openAuth = "true";
    return;
  }
  empty.querySelector("button").dataset.openAuth = "";
  container.innerHTML = '<div class="loading-note">Finding your orders…</div>';
  try {
    const orders = await api("/orders?limit=100");
    $("#stat-orders").textContent = orders.length;
    renderOrders(orders, container);
    empty.classList.toggle("hidden", orders.length > 0);
  } catch (error) {
    container.innerHTML = "";
    empty.classList.remove("hidden");
    empty.querySelector("strong").textContent = "Couldn’t load your orders";
    empty.querySelector("p").textContent = error.message;
    empty.querySelector("button").classList.add("hidden");
  }
}

async function loadAdminProducts() {
  const container = $("#admin-product-list");
  try {
    const products = await api("/products?limit=100");
    container.innerHTML =
      products
        .map(
          (product, index) => `<div class="admin-row">
            <div class="admin-row-thumb">${palettes[index % palettes.length][2]}</div>
            <div><div class="admin-row-name">${escapeHtml(product.name)}</div><div class="admin-row-sub">${product.stock} in stock · ${escapeHtml(state.categories.find((item) => item.id === product.category_id)?.name || "Uncategorized")}</div></div>
            <span class="admin-row-price">${money(product.price)}</span>
            <span class="admin-row-actions"><button class="small-button" data-edit-product="${product.id}">Edit</button> <button class="small-button" data-delete-product="${product.id}">×</button></span>
          </div>`,
        )
        .join("") || '<p class="form-hint">Your catalog is empty. Add your first product here.</p>';
  } catch (error) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(error.message)}</p>`;
  }
}

async function loadAdminCategories() {
  const container = $("#admin-category-list");
  try {
    await loadCategories();
    container.innerHTML =
      state.categories
        .map(
          (category) => `<div class="admin-row">
            <div class="admin-row-thumb">◇</div>
            <div><div class="admin-row-name">${escapeHtml(category.name)}</div><div class="admin-row-sub">Collection #${category.id}</div></div>
            <button class="small-button" data-edit-category="${category.id}">Rename</button>
            <button class="small-button" data-delete-category="${category.id}">×</button>
          </div>`,
        )
        .join("") || '<p class="form-hint">Create your first collection to organize the catalog.</p>';
  } catch (error) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(error.message)}</p>`;
  }
}

async function loadAdminOrders() {
  const container = $("#admin-order-list");
  container.innerHTML = '<div class="loading-note">Checking the order desk…</div>';
  try {
    const orders = await api("/orders?limit=100");
    renderOrders(orders, container, true);
    if (!orders.length) {
      container.innerHTML = '<p class="form-hint">No orders yet. Customer orders will appear here.</p>';
    }
  } catch (error) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(error.message)}</p>`;
  }
}

async function loadAdminUsers() {
  const container = $("#admin-user-list");
  container.innerHTML = '<div class="loading-note">Getting to know your customers…</div>';
  try {
    const users = await api("/users?limit=100");
    container.innerHTML =
      users
        .map(
          (user) => `<div class="admin-row">
            <div class="admin-row-thumb">${escapeHtml(user.full_name.trim().charAt(0).toUpperCase())}</div>
            <div><div class="admin-row-name">${escapeHtml(user.full_name)}</div><div class="admin-row-sub">${escapeHtml(user.email)} · ${escapeHtml(user.mobile)}</div></div>
            <span class="order-status ${user.role === "admin" ? "processing" : ""}">${escapeHtml(user.role)}</span>
            <span></span>
          </div>`,
        )
        .join("") || '<p class="form-hint">No registered accounts yet.</p>';
  } catch (error) {
    container.innerHTML = `<p class="form-hint">${escapeHtml(error.message)}</p>`;
  }
}

async function loadAdminTab() {
  if (!state.user || state.user.role !== "admin") {
    navigate("overview");
    toast("The Admin Studio is available to administrator accounts.", "error");
    return;
  }
  await loadCategories();
  const active = $(".admin-tab.active")?.dataset.adminTab || "products";
  const loaders = {
    products: loadAdminProducts,
    categories: loadAdminCategories,
    orders: loadAdminOrders,
    users: loadAdminUsers,
  };
  await loaders[active]();
}

function openModal() {
  $("#auth-modal").classList.remove("hidden");
  $("input[name=email]").focus();
}

function closeModal() {
  $("#auth-modal").classList.add("hidden");
}

function showAuth(mode = "login") {
  setAuthMode(mode);
  openModal();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === "register";
  $$(".auth-tab").forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.authMode === mode),
  );
  $$(".register-field").forEach((field) =>
    field.classList.toggle("hidden", !registering),
  );
  $("input[name=full_name]").required = registering;
  $("input[name=mobile]").required = registering;
  $("input[name=password]").autocomplete = registering
    ? "new-password"
    : "current-password";
  $("#auth-title").innerHTML = registering
    ? "Find your <span>people.</span>"
    : "Welcome <span>back.</span>";
  $("#auth-eyebrow").textContent = registering
    ? "A LITTLE PLACE TO CALL YOURS"
    : "YOUR ACCOUNT, YOUR WAY";
  $("#auth-subtitle").textContent = registering
    ? "Create a customer account to save your cart and follow your orders."
    : "Sign in to see your cart, place an order, and follow its journey.";
  $(".auth-submit").innerHTML = registering
    ? "Create my account <span>→</span>"
    : "Sign in <span>→</span>";
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $(".auth-submit");
  button.disabled = true;
  const formData = new FormData(form);
  const body = {
    email: formData.get("email"),
    password: formData.get("password"),
  };
  if (state.authMode === "register") {
    body.full_name = formData.get("full_name");
    body.mobile = formData.get("mobile");
  }
  try {
    if (state.authMode === "register") {
      await api("/register", { method: "POST", body: JSON.stringify(body) });
    }
    const result = await api("/login", {
      method: "POST",
      body: JSON.stringify({ email: body.email, password: body.password }),
    });
    state.token = result.access_token;
    localStorage.setItem("forma_access_token", state.token);
    await loadProfile();
    closeModal();
    form.reset();
    toast(
      state.authMode === "register"
        ? "Your account is ready. Welcome in!"
        : `Welcome back, ${state.user.full_name.split(" ")[0]}.`,
    );
    await Promise.all([loadCart(), loadDashboard()]);
    if (state.activeView === "account") renderAccount();
    if (state.activeView === "orders") await loadOrders();
    if (state.activeView === "admin") await loadAdminTab();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    state.user = await api("/users/me", {
      method: "PATCH",
      body: JSON.stringify({
        full_name: form.elements.full_name.value,
        mobile: form.elements.mobile.value,
      }),
    });
    updateAccount();
    renderAccount();
    toast("Your account details are up to date.");
  } catch (error) {
    toast(error.message, "error");
  }
}

function signOut() {
  state.token = null;
  state.user = null;
  state.cart = [];
  localStorage.removeItem("forma_access_token");
  updateAccount();
  renderCart();
  renderAccount();
  loadDashboard();
  toast("You’re signed out. The storefront is still open.");
}

async function createProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  values.price = Number(values.price);
  values.stock = Number(values.stock);
  values.category_id = Number(values.category_id);
  try {
    await api("/products", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    toast("The new product is live in your catalog.");
    await Promise.all([
      loadAdminProducts(),
      loadProducts(),
      loadDashboard(),
    ]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function editProduct(productId) {
  const product = state.products.find((item) => item.id === Number(productId));
  let current = product;
  if (!current) {
    try {
      current = await api(`/products/${productId}`);
    } catch (error) {
      toast(error.message, "error");
      return;
    }
  }
  const name = window.prompt("Product name", current.name);
  if (name === null) return;
  const price = window.prompt("Price (USD)", current.price);
  if (price === null) return;
  const stock = window.prompt("Units in stock", current.stock);
  if (stock === null) return;
  const categoryId = window.prompt("Category ID", current.category_id);
  if (categoryId === null) return;
  const values = {
    name: name.trim(),
    description: current.description || null,
    price: Number(price),
    stock: Number(stock),
    category_id: Number(categoryId),
  };
  try {
    await api(`/products/${productId}`, {
      method: "PUT",
      body: JSON.stringify(values),
    });
    toast("Product details updated.");
    await Promise.all([loadAdminProducts(), loadProducts(), loadDashboard()]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function deleteProduct(productId) {
  if (!window.confirm("Remove this product from the catalog?")) return;
  try {
    await api(`/products/${productId}`, { method: "DELETE" });
    toast("Product removed from the catalog.");
    await Promise.all([loadAdminProducts(), loadProducts(), loadDashboard()]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function createCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = new FormData(form).get("name");
  try {
    await api("/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    form.reset();
    toast("Your new collection is ready.");
    await Promise.all([loadAdminCategories(), loadCategories(), loadDashboard()]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function editCategory(categoryId) {
  const category = state.categories.find(
    (item) => item.id === Number(categoryId),
  );
  if (!category) return;
  const name = window.prompt("Rename collection", category.name);
  if (name === null) return;
  try {
    await api(`/categories/${categoryId}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    toast("Collection name updated.");
    await Promise.all([
      loadAdminCategories(),
      loadCategories(),
      loadProducts(),
      loadDashboard(),
    ]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function deleteCategory(categoryId) {
  if (!window.confirm("Delete this collection? Collections with products can’t be deleted.")) return;
  try {
    await api(`/categories/${categoryId}`, { method: "DELETE" });
    toast("Collection removed.");
    await Promise.all([
      loadAdminCategories(),
      loadCategories(),
      loadDashboard(),
    ]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function cancelOrder(orderId) {
  if (!window.confirm("Cancel this pending order? Inventory will be returned to stock.")) return;
  try {
    await api(`/orders/${orderId}/cancel`, { method: "POST" });
    toast(`Order #${orderId} cancelled; inventory has been restored.`);
    await Promise.all([loadOrders(), loadDashboard(), loadProducts()]);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function advanceOrder(orderId, nextStatus) {
  try {
    await api(`/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    toast(`Order #${orderId} marked ${nextStatus}.`);
    await Promise.all([loadAdminOrders(), loadOrders(), loadDashboard()]);
  } catch (error) {
    toast(error.message, "error");
  }
}

function bindEvents() {
  $$(".nav-link").forEach((link) =>
    link.addEventListener("click", () => navigate(link.dataset.view)),
  );
  $$("[data-go]").forEach((button) =>
    button.addEventListener("click", () => navigate(button.dataset.go)),
  );
  $("#mobile-menu").addEventListener("click", () =>
    $("#sidebar").classList.toggle("open"),
  );
  $("#account-button").addEventListener("click", () => {
    if (state.user) {
      if (window.confirm("Sign out of your customer account on this browser?")) {
        signOut();
      }
    } else {
      showAuth("login");
    }
  });
  $("#refresh-health").addEventListener("click", checkHealth);
  $("#refresh-orders").addEventListener("click", loadOrders);
  $("#product-search").addEventListener("input", () => {
    window.clearTimeout(state.productSearchTimer);
    state.productSearchTimer = window.setTimeout(loadProducts, 260);
  });
  $("#category-filter").addEventListener("change", loadProducts);
  $("#retry-products").addEventListener("click", loadProducts);
  $("#product-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-product]");
    if (button) addToCart(button.dataset.addProduct);
  });
  $("#cart-items").addEventListener("click", (event) => {
    const quantity = event.target.closest("[data-quantity]");
    const remove = event.target.closest("[data-remove-cart]");
    if (quantity)
      updateCartQuantity(
        quantity.dataset.productId,
        Number(quantity.dataset.quantity),
      );
    if (remove) removeCartItem(remove.dataset.removeCart);
  });
  $("#clear-cart").addEventListener("click", async () => {
    if (!window.confirm("Remove all items from your cart?")) return;
    try {
      await api("/cart", { method: "DELETE" });
      await loadCart();
      toast("Your cart is clear.");
    } catch (error) {
      toast(error.message, "error");
    }
  });
  $("#checkout-button").addEventListener("click", checkout);
  $("#orders-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel-order]");
    if (button) cancelOrder(button.dataset.cancelOrder);
  });
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#profile-signin").addEventListener("click", () => showAuth("login"));
  $("#profile-signout").addEventListener("click", () => {
    if (window.confirm("Sign out of your customer account on this browser?")) {
      signOut();
    }
  });
  $$(".admin-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".admin-tab").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      $$(".admin-content").forEach((content) => content.classList.add("hidden"));
      $(`#admin-${tab.dataset.adminTab}`).classList.remove("hidden");
      loadAdminTab();
    }),
  );
  $("#product-form").addEventListener("submit", createProduct);
  $("#category-form").addEventListener("submit", createCategory);
  $("#admin-product-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    const remove = event.target.closest("[data-delete-product]");
    if (edit) editProduct(edit.dataset.editProduct);
    if (remove) deleteProduct(remove.dataset.deleteProduct);
  });
  $("#admin-category-list").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-category]");
    const remove = event.target.closest("[data-delete-category]");
    if (edit) editCategory(edit.dataset.editCategory);
    if (remove) deleteCategory(remove.dataset.deleteCategory);
  });
  $("#admin-order-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-next-status]");
    if (button) advanceOrder(button.dataset.orderId, button.dataset.nextStatus);
  });
  $("#admin-refresh-products").addEventListener("click", loadAdminProducts);
  $("#admin-refresh-categories").addEventListener("click", loadAdminCategories);
  $("#admin-refresh-orders").addEventListener("click", loadAdminOrders);
  $("#admin-refresh-users").addEventListener("click", loadAdminUsers);
  $$(".auth-tab").forEach((tab) =>
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode)),
  );
  $("#auth-form").addEventListener("submit", submitAuth);
  $("#modal-close").addEventListener("click", closeModal);
  $("#auth-browse").addEventListener("click", closeModal);
  $("#auth-modal").addEventListener("click", (event) => {
    if (event.target === $("#auth-modal")) closeModal();
  });
  document.addEventListener("click", (event) => {
    const authButton = event.target.closest("[data-open-auth]");
    if (authButton && authButton.dataset.openAuth) showAuth("login");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      $("#sidebar").classList.remove("open");
    }
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    ) {
      event.preventDefault();
      navigate("shop");
      $("#product-search").focus();
    }
  });
}

async function start() {
  bindEvents();
  await Promise.all([checkHealth(), loadCategories(), loadProfile()]);
  await Promise.all([loadDashboard(), loadProducts()]);
  if (state.user) {
    await loadCart();
    if (state.activeView === "orders") await loadOrders();
  } else {
    renderCart();
  }
}

start();
