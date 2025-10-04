var formData = new FormData();
const proxy = "/api";
var addressArray = JSON.parse(localStorage.getItem("addressArray")) || [];

//DOM Elements
let unorderButtons = document.getElementById("favAddressButtons");

addressArray.forEach((address) => {
  const addressButton = document.createElement("button");
  addressButton.setAttribute("value", address.address);
  addressButton.innerText = address.address;
  //addressButton.addEventListener("click", displayDates(address.datesArray));
  addressButton.addEventListener("click", () => {
    let pickupDates = document.getElementById("pickupDates");
    const garbageDate = address.datesArray.garbageDateArray.find((date) => Date.parse(date) > Date.now());
    const recycleDate = address.datesArray.recycleDateArray.find((date) => Date.parse(date) > Date.now());
    const specialDate = address.datesArray.specialDateArray.find((date) => Date.parse(date) > Date.now());
    const yardDate = address.datesArray.yardDateArray.find((date) => Date.parse(date) > Date.now());

    pickupDates.innerHTML = `<h4>Garbage Date: ${garbageDate}</h4><h4>Recycle Date: ${recycleDate}</h4><h4>special Date: ${specialDate}</h4><h4>yard Date: ${yardDate}</h4>`;
  });
  const buttonList = document.createElement("li");
  buttonList.appendChild(addressButton);

  unorderButtons.append(buttonList);
});
// function displayDates(datesArray) {
//   let pickupDates = document.getElementById("pickupDates");
//   const garbageDate = datesArray.garbageDateArray[0];
//   const recycleDate = datesArray.recycleDateArray[0];
//   const specialDate = datesArray.specialDateArray[0];
//   const yardDate = datesArray.yardDateArray[0];

//   pickupDates.innerHTML = `<h4>Garbage Date: ${garbageDate}</h4><h4>Recycle Date: ${recycleDate}</h4><h4>special Date: ${specialDate}</h4><h4>yard Date: ${yardDate}</h4>`;
// }

function getAddress() {
  let userInput = document.getElementById("address");

  let desti = "/ZoneFinder/Map/GetAddress?query=";
  let url = proxy + desti + userInput.value;

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      let unorderlist = document.createElement("ul");
      unorderlist.id = "dropDown";

      data.forEach((element) => {
        const orderList = document.createElement("li");
        const button = document.createElement("button");
        button.setAttribute("value", element.DisplayName);
        button.setAttribute("onclick", "setAddress(this.value)");
        button.innerText = element.DisplayName;
        orderList.appendChild(button);
        unorderlist.append(orderList);
      });

      const demo1 = document.getElementById("addressButtons");
      demo1.appendChild(unorderlist);

      // console.log(data);
      // var dataList = "<ul id='dropDown'>";
      // for (i = 0; i < data.length; i++) {
      //   dataList += "<li><button value='" + data[i].DisplayName + "' onclick='setAddress(this.value)'>" + data[i].DisplayName + "</button></li>";
      // }
      // dataList += "</ul>";
      // //console.log(dataList);
      // document.getElementById("demo1").innerHTML = dataList;
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
}

function setAddress(buttonValue) {
  document.getElementById("address").value = buttonValue;

  let addressButtons = document.getElementById("dropDown");

  //addressButtons.style.display = "none";
  addressButtons.remove();
  getAddressInfo();
}

function getAddressInfo() {
  let userAddress = document.getElementById("address");

  let desti2 = "/ZoneFinder/Map/GetSearch?searchString=";
  let url2 = proxy + desti2 + userAddress.value;

  fetch(url2)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      //console.log("Data " + data);
      var featureSet = JSON.parse(data);
      let address = featureSet.features[0].properties;
      // var formData = new FormData();

      formData.set("StreetNo", address.MunicipalNumber);
      formData.set("StreetName", address.StreetName);
      formData.set("StreetType", address.StreetType);
      formData.set("UnitNumber", address.UnitNumber);
      formData.set("StreetNoQualifier", "");
      getCalendarData(formData);
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
  //document.getElementById("demo1").innerHTML = "<button id='pickupDate' onclick='getCalendarData()'>View Next Pickup Date</button>";
  //getCalendarData(formData);
}
function getCalendarData(formData) {
  let desti3 = "/ZoneFinder/ZoneLocator/SearchZoneLocator";
  let url3 = proxy + desti3;

  fetch(url3, { method: "POST", body: formData })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      //console.log("response type " + typeof response.json());
      return response.text();
    })
    .then((data) => {
      //console.log(data);
      processData(data);
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
}
function processData(dataString) {
  let usrAddr = document.getElementById("address").value.toUpperCase();
  //console.log("usrAddr: " + usrAddr);
  let addressHoldString;
  const stringArray = dataString.split("<tr>");
  for (let i = 0; i < stringArray.length; i++) {
    //console.log(stringArray[i] + " ");
    if (stringArray[i].includes(usrAddr)) {
      // console.log(stringArray[i] + " ");
      addressHoldString = stringArray[i];
    }
  }
  const stringArray2 = addressHoldString.split(" ");
  let calendarLink;
  for (let i = 0; i < stringArray2.length; i++) {
    if (stringArray2[i].includes("ProcessCalendarRequest")) {
      //console.log(stringArray2[i]);
      calendarLink = stringArray2[i].split('"')[1].replace(/&amp;/g, "&");
    }
  }

  let url4 = proxy + calendarLink;

  fetch(url4)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.text();
    })
    .then((data) => {
      //console.log("Calendar data: " + data);
      getPickupDates(data);
    })
    .catch((error) => {
      console.error("Error: ", error);
    });
}

function getPickupDates(data) {
  const dateString2 = data.match(/var model = ([\s\S]*?);\s+var eventData/)[1];
  const pickupDateJson = JSON.parse(dateString2);

  let garbageDateArray = new Array();
  let garbageDiff = new Array();

  let recycleDateArray = new Array();
  let recycleDiff = new Array();

  pickupDateJson.PickUpDateList.forEach((element) => {
    if (element.CollectionTypeDisplayName == "Garbage" || element.CollectionTypeCode == "10") {
      if (Date.parse(element.FormattedLongSpecialPickUpDate) > Date.now()) {
        garbageDateArray.push(element.FormattedLongSpecialPickUpDate);
        garbageDiff.push(Date.parse(element.FormattedLongSpecialPickUpDate) - Date.now());
      }
    } else if (element.CollectionTypeDisplayName == "Green Bin \u0026 Recycling" || element.CollectionTypeCode == "20") {
      if (Date.parse(element.FormattedLongSpecialPickUpDate) > Date.now()) {
        recycleDateArray.push(element.FormattedLongSpecialPickUpDate);
        recycleDiff.push(Date.parse(element.FormattedLongSpecialPickUpDate) - Date.now());
      }
    }
  });

  let minGarbageDiff = garbageDiff[0];
  let minGarbageDiffIndex = 0;
  for (let i = 0; i < garbageDiff.length; i++) {
    if (garbageDiff[i] < minGarbageDiff) {
      minGarbageDiff = garbageDiff[i];
      minGarbageDiffIndex = i;
    }
  }

  let minRecycleDiff = recycleDiff[0];
  let minRecycleDiffIndex = 0;
  for (let i = 0; i < recycleDiff.length; i++) {
    if (recycleDiff[i] < minRecycleDiff) {
      minRecycleDiff = recycleDiff[i];
      minRecycleDiffIndex = i;
    }
  }

  let yardDateArray = new Array();
  let yardDiff = new Array();

  let specialDateArray = new Array();
  let specialDiff = new Array();

  pickupDateJson.SpecialPickUpList.forEach((element) => {
    if (element.CollectionTypeDisplayName == "3-Container Exemption garbage collection" || element.CollectionTypeCode == "11") {
      if (Date.parse(element.FormattedLongSpecialPickUpDate) > Date.now()) {
        specialDateArray.push(element.FormattedLongSpecialPickUpDate);
        specialDiff.push(Date.parse(element.FormattedLongSpecialPickUpDate) - Date.now());
      }
    } else if (element.CollectionTypeDisplayName == "Yard Waste collection wee" || element.CollectionTypeCode == "30") {
      if (Date.parse(element.FormattedLongSpecialPickUpDate) > Date.now()) {
        yardDateArray.push(element.FormattedLongSpecialPickUpDate);
        yardDiff.push(Date.parse(element.FormattedLongSpecialPickUpDate) - Date.now());
      }
    }
  });

  let minSpecialDiff = specialDiff[0];
  let minSpecialDiffIndex = 0;
  for (let i = 0; i < specialDiff.length; i++) {
    if (specialDiff[i] < minSpecialDiff) {
      minSpecialDiff = specialDiff[i];
      minSpecialDiffIndex = i;
    }
  }

  let minYardDiff = yardDiff[0];
  let minYardDiffIndex = 0;
  for (let i = 0; i < yardDiff.length; i++) {
    if (yardDiff[i] < minYardDiff) {
      minYardDiff = yardDiff[i];
      minYardDiffIndex = i;
    }
  }

  let nextGarbageDate = document.createElement("h4");
  nextGarbageDate.innerText = "Next Garbage Date: " + garbageDateArray[minGarbageDiffIndex];

  let nextRecycleDate = document.createElement("h4");
  nextRecycleDate.innerText = "Next Recycle Date: " + recycleDateArray[minRecycleDiffIndex];

  let nextYardDate = document.createElement("h4");
  nextYardDate.innerText = "Next Yard Date: " + yardDateArray[minYardDiffIndex];

  let nextSpecialDate = document.createElement("h4");
  nextSpecialDate.innerText = "Next Special Date: " + specialDateArray[minSpecialDiffIndex];

  let demo2 = document.getElementById("pickupDates");
  demo2.innerText = "";
  demo2.append(nextGarbageDate);
  demo2.append(nextRecycleDate);
  demo2.append(nextYardDate);
  demo2.append(nextSpecialDate);

  let address = document.getElementById("address");

  let pickupDateObject = { garbageDateArray: garbageDateArray, recycleDateArray: recycleDateArray, yardDateArray: yardDateArray, specialDateArray: specialDateArray };

  let addressDatesObject = { address: address.value, datesArray: pickupDateObject };

  if (!addressArray.some((obj) => obj.address === addressDatesObject.address)) {
    addressArray.push(addressDatesObject);
  }

  let favButton = document.createElement("button");
  favButton.innerText = "Add to favorites";

  favButton.addEventListener("click", () => {
    localStorage.setItem("addressArray", JSON.stringify(addressArray));
  });

  let div = document.getElementById("favButtonDiv");
  div.innerHTML = "";
  div.append(favButton);
}
