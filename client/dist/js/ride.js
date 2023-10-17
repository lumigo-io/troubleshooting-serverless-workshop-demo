var WildRydes = window.WildRydes || {};
WildRydes.map = WildRydes.map || {};

const getCookie = (name) => document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')?.pop() || null;  
const MAX_RIDE_LENGTH_SECONDS = 10;

(async ($) => {
    const [unicornSvg] = await Promise.all([
        fetch('./images/unicorn.svg')
            .then((response) => response.text())
            .then((unicornSvg) => 'data:image/svg+xml;base64,' + btoa(unicornSvg))
    ]);

    const authToken = getCookie('auth_token');

    function clearIncomingUnicorn() {
        if (WildRydes.map.currentMarker) {
            // Delete current marker
            WildRydes.map.currentMarker.removeFrom(WildRydes.map);
            WildRydes.map.currentMarker = undefined;
            // TODO Abort request
        }

        if (WildRydes.map.currentUnicornMarker) {
            WildRydes.map.currentUnicornMarker.removeFrom(WildRydes.map);
            WildRydes.map.currentUnicornMarker = undefined;
        }

        if (WildRydes.map.currentUnicornMarkerIntervalId) {
            clearInterval(WildRydes.map.currentUnicornMarkerIntervalId);
            WildRydes.map.currentUnicornMarkerIntervalId = undefined;
        }                
    }

    function requestUnicorn(pickupLocation) {
        $.ajax({
            method: 'POST',
            headers: {
                Authorization: authToken
            },
            data: JSON.stringify({
                PickupLocation: {
                    Latitude: pickupLocation.latitude,
                    Longitude: pickupLocation.longitude
                }
            }),
            contentType: 'application/json',
            success: completeRequest,
            error: function ajaxError(jqXHR, textStatus, errorThrown) {
                console.error('Error requesting ride: ', textStatus, ', Details: ', errorThrown);
                console.error('Response: ', jqXHR.responseText);
                alert('An error occured when requesting your unicorn:\n' + jqXHR.responseText);
            }
        });
    }

    function completeRequest(result) {
        result.EtaInSeconds = 10;
        console.log(result);
        var unicorn = result;
        if (unicorn) {
            displayUpdate(unicorn.Name + ', your ' + unicorn.Color + ' unicorn, is on their way.');
            animateArrival(
                result.EtaInSeconds,
                function animateCallback() {
                    displayUpdate(unicorn.Name + ' has arrived. Giddy up!');
                    $('#request').prop('disabled', 'disabled');
                    $('#request').text('Set Pickup');
                }
            );
        } else {
            displayUpdate('No unicorn available, please try again');
        }
    }

    // Register click handler for #request button
    $(function onDocReady() {
        $('#request').click(handleRequestClick);
        $(WildRydes.map).on('click', handlePickupChanged);

        // if (!config.api.invokeUrl) {
        //     $('#noApiMessage').show();
        // }

        WildRydes.map = L.map('map').setView(
            [52.158, 5.387], // Amesfoort center
            13
        );

        L.tileLayer(
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }
        ).addTo(WildRydes.map);

        WildRydes.map.on('click', handleRequestClick);
    });

    function handlePickupChanged() {
        var requestButton = $('#request');
        requestButton.text('Request Unicorn');
        requestButton.prop('disabled', false);
    }

    function handleRequestClick(clickData) {
        clearIncomingUnicorn();

        clickData.originalEvent.preventDefault();
        WildRydes.map.currentMarker = L.marker([clickData.latlng.lat, clickData.latlng.lng]).addTo(WildRydes.map);
        requestUnicorn({
            latitude: clickData.latlng.lat,
            longitude: clickData.latlng.lng,
        });
    }

    function animateArrival(etaInSeconds, callback) {
        var dest = WildRydes.map.currentMarker.getLatLng();
        var origin = {};

        var center = WildRydes.map.getCenter();
        var bounds = WildRydes.map.getBounds();

        if (dest.lat > center.lat) {
            origin.lat = bounds.getNorthWest().lat;
        } else {
            origin.lat = bounds.getSouthEast().lat;
        }

        if (dest.lng > center.lng) {
            origin.lng = bounds.getNorthWest().lng;
        } else {
            origin.lng = bounds.getSouthEast().lng;
        }

        var unicornIcon = L.icon({
            iconUrl: unicornSvg,
            iconRetinaUrl: unicornSvg,
            iconSize: [95, 95],
            iconAnchor: [47, 47],
            popupAnchor: [-3, -76],
        });

        const progressLat = (dest.lat - origin.lat) / etaInSeconds;
        const progressLng = (dest.lng - origin.lng) / etaInSeconds;

        WildRydes.map.currentUnicornMarker = L.marker(
            L.latLng(origin.lat, origin.lng),
            {
                icon: unicornIcon,
                iconSize: [32, 32],
            }
        ).addTo(WildRydes.map);

        var ticksLeft = etaInSeconds;
        WildRydes.map.currentUnicornMarkerIntervalId = setInterval(function() {
            var currentPosition = WildRydes.map.currentUnicornMarker.getLatLng();

            var newPosition = L.latLng(currentPosition.lat + progressLat, currentPosition.lng + progressLng);

            if ((ticksLeft -= 1) < 1) {
                newPosition = dest;
            }

            WildRydes.map.currentUnicornMarker.setLatLng(newPosition);

            if (ticksLeft === 0) {
                clearIncomingUnicorn();

                callback();
            }
        }, 1000);
    }

    function displayUpdate(text) {
        $('#updates').append($('<li>' + text + '</li>'));
    }
})(jQuery);
