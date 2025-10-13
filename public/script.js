// App state management
const APP_STATE = {
  isLoading: false,
  connectionStatus: navigator.onLine,
};

const proxy = "/api";
var addressArray = JSON.parse(localStorage.getItem("addressArray")) || [];

//DOM Elements
let unorderButtons = document.getElementById("favAddressButtons");
const pickupDatesElement = document.getElementById("pickupDates");
const addressInput = document.getElementById("address");
const addressButtonsElement = document.getElementById("addressButtons");
const favButtonDiv = document.getElementById("favButtonDiv");

// Initialize application
document.addEventListener("DOMContentLoaded", () => {
  initializeUI();
  setupEventListeners();
  renderFavoriteAddresses();
  updateConnectionStatus();
});

// Setup core UI elements
function initializeUI() {
  // Create connection status indicator
  const statusElement = document.createElement("div");
  statusElement.id = "connectionStatus";
  document.body.prepend(statusElement);

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
}

// Request notification permission
function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        // Store permission in localStorage
        localStorage.setItem("notificationPermission", "granted");
        document.getElementById("notificationButton").innerHTML = "Notifications Enabled";
        document.getElementById("notificationButton").classList.add("notification-enabled");

        // Schedule notifications for all saved addresses
        addressArray.forEach((address) => {
          scheduleNotificationsForAddress(address);
        });
      } else if (permission === "denied") {
        document.getElementById("notificationButton").innerHTML = "Notifications Denied";
      }
    });
  }
}

// Schedule notifications for a specific address
function scheduleNotificationsForAddress(addressObj) {
  if (Notification.permission !== "granted") return;

  const dates = addressObj.datesArray;
  const address = addressObj.address;

  // Schedule notifications for each collection type
  scheduleNotification("Garbage", dates.garbageDateArray[0], address);
  scheduleNotification("Recycling", dates.recycleDateArray[0], address);
  scheduleNotification("Special", dates.specialDateArray[0], address);
  scheduleNotification("Yard Waste", dates.yardDateArray[0], address);
}

// Schedule a single notification
function scheduleNotification(type, dateString, address) {
  if (!dateString || dateString === "No upcoming date") return;

  const notificationId = `${type}-${address}-${dateString}`.replace(/\s+/g, "-");
  const date = new Date(dateString);

  // Calculate notification time (6pm the day before)
  const notificationDate = new Date(date);
  notificationDate.setDate(notificationDate.getDate() - 1); // Day before
  notificationDate.setHours(18, 0, 0, 0); // At 6:00 PM

  // Only schedule if it's in the future
  if (notificationDate > new Date()) {
    // Register the notification with the service worker
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const notificationData = {
        id: notificationId,
        title: `${type} Collection Tomorrow`,
        body: `Your ${type.toLowerCase()} at ${address} will be collected tomorrow`,
        icon: "/icon.png",
        timestamp: notificationDate.getTime(),
      };

      // Send to the service worker to schedule
      navigator.serviceWorker.ready.then((registration) => {
        registration.active.postMessage({
          action: "scheduleNotification",
          notification: notificationData,
        });
      });
    }
  }
}

// Setup event listeners
function setupEventListeners() {
  // Connection status listeners
  window.addEventListener("online", updateConnectionStatus);
  window.addEventListener("offline", updateConnectionStatus);

  // Search on enter key
  addressInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      getAddress();
    }
  });
}

// Update and display connection status
function updateConnectionStatus() {
  APP_STATE.connectionStatus = navigator.onLine;
  const statusElement = document.getElementById("connectionStatus");

  if (APP_STATE.connectionStatus) {
    statusElement.innerText = "🟢 Online";
    statusElement.className = "online-status";
  } else {
    statusElement.innerText = "🔴 Offline";
    statusElement.className = "offline-status";
  }
}

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
function removeAddress(index) {
  addressArray.splice(index, 1);
  localStorage.setItem("addressArray", JSON.stringify(addressArray));
  renderFavoriteAddresses();
}

function displayDates() {
  const garbageDate = address.datesArray.garbageDateArray.find((date) => Date.parse(date) > Date.now()) || "No upcoming date";
  const recycleDate = address.datesArray.recycleDateArray.find((date) => Date.parse(date) > Date.now()) || "No upcoming date";
  const specialDate = address.datesArray.specialDateArray.find((date) => Date.parse(date) > Date.now()) || "No upcoming date";
  const yardDate = address.datesArray.yardDateArray.find((date) => Date.parse(date) > Date.now()) || "No upcoming date";

  const formattedGarbageDate = formatDate(garbageDate);
  const formattedRecycleDate = formatDate(recycleDate);
  const formattedSpecialDate = formatDate(specialDate);
  const formattedYardDate = formatDate(yardDate);

  pickupDatesElement.innerHTML = `
    <h3>Collection Schedule for ${address.address}</h3>
    <div class="collection-item garbage">
      <h4>Garbage: ${formattedGarbageDate}</h4>
      <div class="days-remaining">${getDaysRemaining(garbageDate)}</div>
    </div>
    <div class="collection-item recycle">
      <h4>Recycling: ${formattedRecycleDate}</h4>
      <div class="days-remaining">${getDaysRemaining(recycleDate)}</div>
    </div>
    <div class="collection-item special">
      <h4>Special: ${formattedSpecialDate}</h4>
      <div class="days-remaining">${getDaysRemaining(specialDate)}</div>
    </div>
    <div class="collection-item yard">
      <h4>Yard Waste: ${formattedYardDate}</h4>
      <div class="days-remaining">${getDaysRemaining(yardDate)}</div>
    </div>
  `;
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
  return `<span class="days">${diffDays} days</span>`;
}

function getAddress() {
  if (!APP_STATE.connectionStatus) {
    showOfflineMessage(addressButtonsElement);
    return;
  }

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
  if (!APP_STATE.connectionStatus) {
    showOfflineMessage(pickupDatesElement);
    return;
  }

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
      } else if (element.CollectionTypeDisplayName === "Yard Waste collection wee" || element.CollectionTypeCode === "30") {
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
      <h4>Garbage: ${formattedGarbageDate}</h4>
      <div class="days-remaining">${getDaysRemaining(garbageDate)}</div>
    </div>
    <div class="collection-item recycle">
      <h4>Recycling: ${formattedRecycleDate}</h4>
      <div class="days-remaining">${getDaysRemaining(recycleDate)}</div>
    </div>
    <div class="collection-item special">
      <h4>Special: ${formattedSpecialDate}</h4>
      <div class="days-remaining">${getDaysRemaining(specialDate)}</div>
    </div>
    <div class="collection-item yard">
      <h4>Yard Waste: ${formattedYardDate}</h4>
      <div class="days-remaining">${getDaysRemaining(yardDate)}</div>
    </div>
  `;
}

// show the save to favorites button
function showSaveButton(dates) {
  const address = addressInput.value;
  const favButton = document.createElement("button");
  favButton.className = "save-button";

  const isInFavorites = addressArray.some((obj) => obj.address === address);
  favButton.innerText = isInFavorites ? "Update in favorites" : "Add to favorites";

  favButton.addEventListener("click", () => {
    const existingIndex = addressArray.findIndex((obj) => obj.address === address);

    const addressDatesObject = {
      address: address,
      datesArray: dates,
      lastUpdated: new Date().toISOString(),
    };

    if (existingIndex === -1) {
      addressArray.push(addressDatesObject);
      favButton.innerText = "Added to favorites!";
    } else {
      addressArray[existingIndex] = addressDatesObject;
      favButton.innerText = "Updated in favorites!";
    }

    localStorage.setItem("addressArray", JSON.stringify(addressArray));
    renderFavoriteAddresses();

    // Schedule notifications for this address if permissions are granted
    if (Notification.permission === "granted") {
      scheduleNotificationsForAddress(addressDatesObject);
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
