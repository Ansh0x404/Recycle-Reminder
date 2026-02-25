// Index Db helpers
const DB_NAME = "GarbageAppDB";
const STORE_NAME = "addresses";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "address" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

async function saveAddressToDB(item) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const request = store.put(item);

      request.onsuccess = () => resolve(); // Success
      request.onerror = () => reject(request.error); // Fail
      tx.oncomplete = () => resolve(); // Transaction Success
      tx.onerror = () => reject(tx.error); // Transaction Fail
    });
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
    alert("Failed to save to database. storage might be full.");
  }
}

async function getAddressesFromDB() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function deleteAddressFromDB(addressKey) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(addressKey);
  return new Promise((resolve) => (tx.oncomplete = resolve));
}

// App state management
const APP_STATE = {
  isLoading: false,
  connectionStatus: navigator.onLine,
};

const proxy = "/api";
var addressArray = [];

// DOM Elements
let unorderButtons = document.getElementById("favAddressButtons");
const pickupDatesElement = document.getElementById("pickupDates");
const addressInput = document.getElementById("address");
const addressButtonsElement = document.getElementById("addressButtons");
const favButtonDiv = document.getElementById("favButtonDiv");

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
  // Load addresses from IndexedDB
  addressArray = await getAddressesFromDB();

  initializeUI();
  setupEventListeners();
  renderFavoriteAddresses();
  // updateConnectionStatus();
});

// Setup core UI elements
function initializeUI() {
  // Create connection status indicator
  // const statusElement = document.createElement("div");
  // statusElement.id = "connectionStatus";
  // document.body.prepend(statusElement);

  // Get the action buttons container
  const actionButtonsContainer = document.getElementById("actionButtons");

  // Create notifications permission button
  const notificationButton = document.createElement("button");
  notificationButton.id = "notificationButton";

  // Check if notifications are already enabled
  if (Notification.permission === "granted") {
    notificationButton.innerHTML = "Notifications Enabled";
    notificationButton.classList.add("notification-enabled");
  } else {
    notificationButton.innerHTML = "Enable Notifications";
  }

  notificationButton.addEventListener("click", requestNotificationPermission);
  actionButtonsContainer.appendChild(notificationButton);

  // Install App Logic
  let deferredPrompt;
  const installButton = document.createElement("button");
  installButton.id = "installButton";
  installButton.textContent = "Install App";
  installButton.style.display = "none"; // Hidden by default

  // Check if app is already installed (running in standalone mode)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    installButton.textContent = "App Installed";
    installButton.style.display = "block";
    installButton.className = "appp-installed";
    installButton.disabled = true;
  }

  // Listen for the "beforeinstallprompt" event
  window.addEventListener("beforeinstallprompt", (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    installButton.style.display = "block";
    installButton.textContent = "Install App";
    installButton.disabled = false;
  });

  // Handle the install button click
  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and can't use it again, throw it away
      deferredPrompt = null;
    }
  });

  // Listen for the "appinstalled" event
  window.addEventListener("appinstalled", () => {
    // Hide the app-provided install promotion
    installButton.textContent = "App Installed";
    installButton.className = "app-installed";
    installButton.disabled = true;
    deferredPrompt = null;
    console.log("PWA was installed");
  });

  actionButtonsContainer.appendChild(installButton);
}

// Request notification permission
async function requestNotificationPermission() {
  if (!("serviceWorker" in navigator)) return;

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    localStorage.setItem("notificationPermission", "granted");
    document.getElementById("notificationButton").innerHTML = "Notifications Active";
    document.getElementById("notificationButton").classList.add("notification-enabled");

    try {
      console.log("Registering for Push Notifications...");

      // Get Public Key from your Server
      const response = await fetch("/api/vapidPublicKey");
      const publicKey = await response.text();

      // Subscribe the browser to the Push Service
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      console.log("Browser subscribed:", subscription);

      // C. Send this subscription + Current Favorites to your Server
      await syncFavoritesToServer(subscription);
    } catch (err) {
      console.error("Error subscribing to push notifications:", err);
    }
  }
}

// Sync subscriptions to server
async function syncFavoritesToServer(subscription) {
  await fetch("/api/subscribe", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  });
  console.log("Synced all subscriptions to server.");
}

// Setup event listeners
function setupEventListeners() {
  // Connection status listeners
  // window.addEventListener("online", updateConnectionStatus);
  // window.addEventListener("offline", updateConnectionStatus);

  // Search on enter key
  addressInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      getAddress();
    }
  });
}

// Update and display connection status
// function updateConnectionStatus() {
//   APP_STATE.connectionStatus = navigator.onLine;
//   const statusElement = document.getElementById("connectionStatus");

//   if (APP_STATE.connectionStatus) {
//     statusElement.innerText = "🟢 Online";
//     statusElement.className = "online-status";
//   } else {
//     statusElement.innerText = "🔴 Offline";
//     statusElement.className = "offline-status";
//   }
// }

function renderFavoriteAddresses() {
  unorderButtons.innerHTML = "";

  if (addressArray.length === 0) {
    const noFavMessage = document.createElement("p");
    noFavMessage.innerText = "No favorites saved. Search for an address and add it to favorites.";
    noFavMessage.className = "fav-message";
    unorderButtons.appendChild(noFavMessage);
    return;
  }

  addressArray.forEach((address, index) => {
    const buttonList = document.createElement("li");
    buttonList.className = "fav-item";

    //create address button
    const addressButton = document.createElement("button");
    addressButton.setAttribute("value", address.address);
    addressButton.innerText = address.address;
    addressButton.className = "address-btn";
    addressButton.addEventListener("click", () => displayDates(address.datesArray));

    // Create delete button
    const deleteButton = document.createElement("button");
    deleteButton.innerText = "X";
    deleteButton.className = "delete-btn";
    deleteButton.addEventListener("click", (e) => {
      e.stopPropagation();
      removeAddress(index);
    });

    buttonList.appendChild(addressButton);
    buttonList.appendChild(deleteButton);
    unorderButtons.append(buttonList);
  });
}

// Remove an address from favorites
async function removeAddress(index) {
  const item = addressArray[index];
  await deleteAddressFromDB(item.address); // Remove from DB

  addressArray.splice(index, 1); // Remove from memory
  renderFavoriteAddresses();
}

// Format date for display
function formatDate(dateString) {
  if (!dateString || dateString === "No upcoming date") return dateString;

  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Calculate and format days remaining
function getDaysRemaining(dateString) {
  if (!dateString || dateString === "No upcoming date") return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '<span class="today">Today!</span>';
  if (diffDays === 1) return '<span class="tomorrow">Tomorrow!</span>';
  return `${diffDays} <br/> days`;
}

function getAddress() {
  // if (!APP_STATE.connectionStatus) {
  //   showOfflineMessage(addressButtonsElement);
  //   return;
  // }

  const userInput = addressInput.value.trim();
  if (!userInput) return;

  showLoading("addressButtons");

  let desti = "/ZoneFinder/Map/GetAddress?query=";
  let url = proxy + desti + encodeURIComponent(userInput);

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      if (data.length === 0) {
        addressButtonsElement.innerHTML = "<p>No addresses found. Please try a different search.</p>";
        return;
      }

      let unorderlist = document.createElement("ul");
      unorderlist.id = "dropDown";
      unorderlist.className = "address-dropdown";

      data.forEach((element) => {
        const orderList = document.createElement("li");
        const button = document.createElement("button");
        button.setAttribute("value", element.DisplayName);
        button.innerText = element.DisplayName;
        button.addEventListener("click", () => setAddress(element.DisplayName));
        orderList.appendChild(button);
        unorderlist.append(orderList);
      });

      addressButtonsElement.innerHTML = "";
      addressButtonsElement.appendChild(unorderlist);
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
}

function setAddress(buttonValue) {
  addressInput.value = buttonValue;

  const addressButtons = document.getElementById("dropDown");

  //addressButtons.style.display = "none";
  if (addressButtons) addressButtons.remove();
  getAddressInfo();
}

function getAddressInfo() {
  // if (!APP_STATE.connectionStatus) {
  //   showOfflineMessage(pickupDatesElement);
  //   return;
  // }

  showLoading("pickupDates");
  const userAddress = addressInput.value;
  const desti2 = "/ZoneFinder/Map/GetSearch?searchString=";
  const url2 = proxy + desti2 + encodeURIComponent(userAddress);

  fetch(url2)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      const featureSet = JSON.parse(data);

      if (!featureSet.features || featureSet.features.length === 0) {
        hideLoading("pickupDates");
        pickupDatesElement.innerHTML = "<p>Could not find address information. Please try a different address.</p>";
        return;
      }

      const address = featureSet.features[0].properties;
      const formData = new FormData();

      formData.set("StreetNo", address.MunicipalNumber);
      formData.set("StreetName", address.StreetName);
      formData.set("StreetType", address.StreetType);
      formData.set("UnitNumber", address.UnitNumber);
      formData.set("StreetNoQualifier", "");

      getCalendarData(formData);
    })
    .catch((error) => {
      hideLoading("pickupDates");
      console.error("Error: ", error);
    });
}

function getCalendarData(formData) {
  let desti3 = "/ZoneFinder/ZoneLocator/SearchZoneLocator";
  let url3 = proxy + desti3;

  fetch(url3, { method: "POST", body: formData })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.text();
    })
    .then((data) => {
      processData(data);
    })
    .catch((error) => {
      hideLoading("pickupDates");
      console.error("Error: ", error);
    });
}

function processData(dataString) {
  try {
    let usrAddr = addressInput.value.toUpperCase();
    let addressHoldString;
    const stringArray = dataString.split("<tr>");

    for (let i = 0; i < stringArray.length; i++) {
      if (stringArray[i].includes(usrAddr)) {
        addressHoldString = stringArray[i];
      }
    }

    if (!addressHoldString) {
      hideLoading("pickupDates");
      pickupDatesElement.innerHTML = "<p>Could not find collection data for this address.</p>";
      return;
    }

    const stringArray2 = addressHoldString.split(" ");
    let calendarLink;
    for (let i = 0; i < stringArray2.length; i++) {
      if (stringArray2[i].includes("ProcessCalendarRequest")) {
        calendarLink = stringArray2[i].split('"')[1].replace(/&amp;/g, "&");
      }
    }

    if (!calendarLink) {
      hideLoading("pickupDates");
      pickupDatesElement.innerHTML = "<p>Could not find collection calendar for this address.</p>";
      return;
    }

    const url4 = proxy + calendarLink;

    fetch(url4)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.text();
      })
      .then((data) => {
        getPickupDates(data);
      })
      .catch((error) => {
        hideLoading("pickupDates");
        console.error("Error: ", error);
      });
  } catch (error) {
    hideLoading("pickupDates");
    console.error("Error: ", error);
  }
}

function getPickupDates(data) {
  const dateString2 = data.match(/var model = ([\s\S]*?);\s+var eventData/)[1];
  const pickupDateJson = JSON.parse(dateString2);

  //extract the dates from the data
  const dates = extractDates(pickupDateJson);

  hideLoading("pickupDates");

  // Display the dates
  displayDates(dates);

  showSaveButton(dates);
}

// Extract dates from pickup data
function extractDates(pickupDateJson) {
  const dates = {
    garbageDateArray: [],
    recycleDateArray: [],
    specialDateArray: [],
    yardDateArray: [],
  };

  // Extract regular pickup dates
  pickupDateJson.PickUpDateList.forEach((element) => {
    const pickupDate = element.FormattedLongSpecialPickUpDate;
    const pickupTimestamp = Date.parse(pickupDate);

    if (pickupTimestamp > Date.now()) {
      if (element.CollectionTypeDisplayName === "Garbage" || element.CollectionTypeCode === "10") {
        dates.garbageDateArray.push(pickupDate);
      } else if (element.CollectionTypeDisplayName === "Green Bin \u0026 Recycling" || element.CollectionTypeCode === "20") {
        dates.recycleDateArray.push(pickupDate);
      }
    }
  });

  // Extract special pickup dates
  pickupDateJson.SpecialPickUpList.forEach((element) => {
    const pickupDate = element.FormattedLongSpecialPickUpDate;
    const pickupTimestamp = Date.parse(pickupDate);

    if (pickupTimestamp > Date.now()) {
      if (element.CollectionTypeDisplayName === "3-Container Exemption garbage collection" || element.CollectionTypeCode === "11") {
        dates.specialDateArray.push(pickupDate);
      } else if (element.CollectionTypeDisplayName === "Yard Waste collection week" || element.CollectionTypeCode === "30") {
        dates.yardDateArray.push(pickupDate);
      }
    }
  });

  // Sort all date arrays by timestamp (ascending)
  dates.garbageDateArray.sort((a, b) => Date.parse(a) - Date.parse(b));
  dates.recycleDateArray.sort((a, b) => Date.parse(a) - Date.parse(b));
  dates.specialDateArray.sort((a, b) => Date.parse(a) - Date.parse(b));
  dates.yardDateArray.sort((a, b) => Date.parse(a) - Date.parse(b));

  return dates;
}

function displayDates(dates) {
  const garbageDate = dates.garbageDateArray[0] || "No upcoming date";
  const recycleDate = dates.recycleDateArray[0] || "No upcoming date";
  const specialDate = dates.specialDateArray[0] || "No upcoming date";
  const yardDate = dates.yardDateArray[0] || "No upcoming date";

  const formattedGarbageDate = formatDate(garbageDate);
  const formattedRecycleDate = formatDate(recycleDate);
  const formattedSpecialDate = formatDate(specialDate);
  const formattedYardDate = formatDate(yardDate);

  pickupDatesElement.innerHTML = "";

  pickupDatesElement.innerHTML = `
    <h3>Collection Schedule</h3>
    <div class="collection-item garbage">
      <div class="collection-info">
        <span class="collection-label">Garbage Collection</span>
        <span class="collection-date">${formattedGarbageDate}</span>
      </div>
      <div class="days-badge">
        ${getDaysRemaining(garbageDate)}
      </div>
    </div>
    <div class="collection-item recycle">
      <div class="collection-info">
        <span class="collection-label">Recycling & Green Bin</span>
        <span class="collection-date">${formattedRecycleDate}</span>
      </div>
      <div class="days-badge">
        ${getDaysRemaining(recycleDate)}
      </div>
    </div>
    <div class="collection-item special">
      <div class="collection-info">
        <span class="collection-label">3-Container Exemption</span>
        <span class="collection-date">${formattedSpecialDate}</span>
      </div>
      <div class="days-badge">
        ${getDaysRemaining(specialDate)}
      </div>
    </div>
    <div class="collection-item yard">
      <div class="collection-info">
        <span class="collection-label">Yard Waste Week</span>
        <span class="collection-date">${formattedYardDate}</span>
      </div>
      <div class="days-badge">
        ${getDaysRemaining(yardDate)}
      </div>
    </div>
  `;
}

// Show the save to favorites button
function showSaveButton(dates) {
  const address = addressInput.value;
  const favButton = document.createElement("button");
  favButton.className = "save-button";

  const isInFavorites = addressArray.some((obj) => obj.address === address);
  favButton.innerText = isInFavorites ? "Update in favorites" : "Add to favorites";

  favButton.addEventListener("click", async () => {
    const addressDatesObject = {
      address: address,
      datesArray: dates,
      lastUpdated: new Date().toISOString(),
    };

    const existingIndex = addressArray.findIndex((obj) => obj.address === address);
    if (existingIndex === -1) {
      addressArray.push(addressDatesObject);
    } else {
      addressArray[existingIndex] = addressDatesObject;
    }

    // Save to IndexedDB
    await saveAddressToDB(addressDatesObject);
    renderFavoriteAddresses();

    // VAPID Sync Logic
    if (Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await syncFavoritesToServer(subscription);
      }
    }

    favButton.innerText = "Saved!";
    favButton.disabled = true;
    setTimeout(() => {
      favButton.innerText = "Update in favorites";
      favButton.disabled = false;
    }, 1500);
  });

  favButtonDiv.innerHTML = "";
  favButtonDiv.append(favButton);
}

// Show offline message
function showOfflineMessage(element) {
  element.innerHTML = `
    <div class="offline-message">
      <p>You are currently offline. Please connect to the internet to perform this action.</p>
    </div>
  `;
}

// Loading indicator functions
function showLoading(elementId) {
  APP_STATE.isLoading = true;
  const element = document.getElementById(elementId);
  element.innerHTML = '<div class="loading-spinner"></div>';
}

function hideLoading(elementId) {
  APP_STATE.isLoading = false;
  const element = document.getElementById(elementId);
  element.innerHTML = "";
}
