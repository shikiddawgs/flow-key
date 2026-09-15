/**
 * Keyframe Flow - Host Script
 * Converts normalized cubic Bezier coordinates into After Effects KeyframeEase values.
 */

function applyFlowToSelectedKeys(x1, y1, x2, y2) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a composition.");
            return "error";
        }

        var selectedLayers = comp.selectedLayers;
        if (selectedLayers.length === 0) {
            alert("Please select at least one layer with keyframes.");
            return "error";
        }

        app.beginUndoGroup("Apply Flow Easing");

        var keysAffected = 0;

        for (var i = 0; i < selectedLayers.length; i++) {
            var layer = selectedLayers[i];
            var selectedProps = layer.selectedProperties;

            for (var p = 0; p < selectedProps.length; p++) {
                var prop = selectedProps[p];

                // Check if property can have keyframes and has selected keys
                if (prop.canVaryOverTime && prop.selectedKeys && prop.selectedKeys.length > 0) {
                    var selKeys = prop.selectedKeys;

                    for (var k = 0; k < selKeys.length; k++) {
                        var keyIndex = selKeys[k];

                        // We apply easing to the interval between the selected keyframe and the next keyframe.
                        if (keyIndex < prop.numKeys) {
                            applyEaseToKeyPair(prop, keyIndex, keyIndex + 1, x1, y1, x2, y2);
                            keysAffected++;
                        }
                    }
                }
            }
        }

        app.endUndoGroup();

        if (keysAffected === 0) {
            // alert("No valid keyframe intervals selected.");
            return "error";
        }

        return "true";
    } catch (e) {
        alert("Error in Apply Flow: " + e.toString());
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

/**
 * Calculates and applies temporal easing based on Bezier curve coordinates.
 */
function applyEaseToKeyPair(prop, key1Index, key2Index, x1, y1, x2, y2) {
    var time1 = prop.keyTime(key1Index);
    var time2 = prop.keyTime(key2Index);
    var val1 = prop.keyValue(key1Index);
    var val2 = prop.keyValue(key2Index);

    var timeDiff = time2 - time1;
    if (timeDiff <= 0) return;

    var propType = prop.propertyValueType;
    var dims = 1;
    var isSpatial = false;

    // Determine the number of dimensions the property has
    if (propType === PropertyValueType.TwoD_SPATIAL) { dims = 2; isSpatial = true; }
    else if (propType === PropertyValueType.ThreeD_SPATIAL) { dims = 3; isSpatial = true; }
    else if (propType === PropertyValueType.TwoD) dims = 2;
    else if (propType === PropertyValueType.ThreeD) dims = 3;
    else if (propType === PropertyValueType.COLOR) dims = 4;

    // --- Influence (same for all dimensions) ---
    var easeOutInfluence = Math.max(0.1, Math.min(100, x1 * 100));
    var easeInInfluence = Math.max(0.1, Math.min(100, (1 - x2) * 100));

    var easeOutArray = [];
    var easeInArray = [];

    if (isSpatial) {
        // For spatial properties, AE uses composite speed (Euclidean distance)
        var distSq = 0;
        for (var d = 0; d < dims; d++) {
            distSq += Math.pow(val2[d] - val1[d], 2);
        }
        var totalDist = Math.sqrt(distSq);
        var avgSpeed = totalDist / timeDiff;

        var easeOutSpeed = (avgSpeed === 0 || x1 === 0) ? 0 : (y1 / x1) * avgSpeed;
        var easeInSpeed = (avgSpeed === 0 || x2 === 1) ? 0 : ((1 - y2) / (1 - x2)) * avgSpeed;

        // For spatial properties, AE requires exactly ONE KeyframeEase object in the array,
        // even if it's 2D or 3D Spatial.
        easeOutArray.push(new KeyframeEase(easeOutSpeed, easeOutInfluence));
        easeInArray.push(new KeyframeEase(easeInSpeed, easeInInfluence));
    } else {
        // For non-spatial properties, compute per-dimension speed
        for (var d = 0; d < dims; d++) {
            var v1 = (dims === 1) ? val1 : val1[d];
            var v2 = (dims === 1) ? val2 : val2[d];
            var valDiff = v2 - v1;
            // DONT use Math.abs() here! AE needs negative speed if the value is decreasing.
            var avgSpeed = valDiff / timeDiff;

            var easeOutSpeed = (avgSpeed === 0 || x1 === 0) ? 0 : (y1 / x1) * avgSpeed;
            var easeInSpeed = (avgSpeed === 0 || x2 === 1) ? 0 : ((1 - y2) / (1 - x2)) * avgSpeed;

            easeOutArray.push(new KeyframeEase(easeOutSpeed, easeOutInfluence));
            easeInArray.push(new KeyframeEase(easeInSpeed, easeInInfluence));
        }
    }

    // Set interpolation to BEZIER so the custom eases actually take effect
    prop.setInterpolationTypeAtKey(key1Index, prop.keyInInterpolationType(key1Index), KeyframeInterpolationType.BEZIER);
    prop.setInterpolationTypeAtKey(key2Index, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(key2Index));

    // Retrieve existing eases for the sides of the keyframes we are NOT modifying
    var key1InEase = prop.keyInTemporalEase(key1Index);
    var key2OutEase = prop.keyOutTemporalEase(key2Index);

    // Apply the new temporal eases
    prop.setTemporalEaseAtKey(key1Index, key1InEase, easeOutArray);
    prop.setTemporalEaseAtKey(key2Index, easeInArray, key2OutEase);
}

/**
 * Gets the Bezier coordinates of the active (first selected) keyframe.
 */
function getFlowFromSelectedKeys() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";

        var selectedProps = comp.selectedProperties;
        if (!selectedProps || selectedProps.length === 0) return "error";

        var targetProp = null;
        var keyIndex = -1;

        // Find the first selected property that has selected keyframes
        for (var i = 0; i < selectedProps.length; i++) {
            var prop = selectedProps[i];
            if (prop.canVaryOverTime && prop.selectedKeys && prop.selectedKeys.length > 0) {
                targetProp = prop;
                keyIndex = prop.selectedKeys[0];
                break;
            }
        }

        if (!targetProp || keyIndex === -1) return "error";
        if (keyIndex >= targetProp.numKeys) return "error"; // Need next keyframe to calculate speed

        var time1 = targetProp.keyTime(keyIndex);
        var time2 = targetProp.keyTime(keyIndex + 1);
        var val1 = targetProp.keyValue(keyIndex);
        var val2 = targetProp.keyValue(keyIndex + 1);

        var timeDiff = time2 - time1;
        if (timeDiff <= 0) return "error";

        var propType = targetProp.propertyValueType;
        var isSpatial = (propType === PropertyValueType.TwoD_SPATIAL || propType === PropertyValueType.ThreeD_SPATIAL);

        var valDiff;
        if (isSpatial) {
            var distSq = 0;
            for (var j = 0; j < val1.length; j++) {
                distSq += Math.pow(val2[j] - val1[j], 2);
            }
            valDiff = Math.sqrt(distSq);
        } else {
            var v1 = (val1 instanceof Array) ? val1[0] : val1;
            var v2 = (val2 instanceof Array) ? val2[0] : val2;
            valDiff = v2 - v1;
        }

        var avgSpeed = valDiff / timeDiff;

        var easeOut = targetProp.keyOutTemporalEase(keyIndex)[0];
        var easeIn = targetProp.keyInTemporalEase(keyIndex + 1)[0];

        var x1 = easeOut.influence / 100;
        var x2 = 1 - (easeIn.influence / 100);

        var y1, y2;
        if (avgSpeed === 0) {
            y1 = 0;
            y2 = 1;
        } else if (isSpatial) {
            y1 = x1 * (Math.abs(easeOut.speed) / avgSpeed);
            y2 = 1 - (1 - x2) * (Math.abs(easeIn.speed) / avgSpeed);
        } else {
            y1 = x1 * (easeOut.speed / avgSpeed);
            y2 = 1 - (1 - x2) * (easeIn.speed / avgSpeed);
        }

        x1 = Math.max(0, Math.min(1, x1));
        y1 = Math.max(-0.5, Math.min(1.5, y1));
        x2 = Math.max(0, Math.min(1, x2));
        y2 = Math.max(-0.5, Math.min(1.5, y2));

        return x1.toFixed(4) + "," + y1.toFixed(4) + "," + x2.toFixed(4) + "," + y2.toFixed(4);
    } catch (e) {
        return "error";
    }
}

/**
 * Applies direct Speed and Influence to selected keyframes (Speed Graph Mode).
 * Handle 1 (Left) = Out Ease (applied to key1)
 * Handle 2 (Right) = In Ease (applied to key2)
 */


function applySpeedToKeyPair(prop, key1Index, key2Index, speedOut, influenceOut, speedIn, influenceIn) {
    var time1 = prop.keyTime(key1Index);
    var time2 = prop.keyTime(key2Index);
    var val1 = prop.keyValue(key1Index);
    var val2 = prop.keyValue(key2Index);

    var timeDiff = time2 - time1;
    if (timeDiff <= 0) return;

    var propType = prop.propertyValueType;
    var dims = 1;
    var isSpatial = false;

    if (propType === PropertyValueType.TwoD_SPATIAL) { dims = 2; isSpatial = true; }
    else if (propType === PropertyValueType.ThreeD_SPATIAL) { dims = 3; isSpatial = true; }
    else if (propType === PropertyValueType.TwoD) dims = 2;
    else if (propType === PropertyValueType.ThreeD) dims = 3;
    else if (propType === PropertyValueType.COLOR) dims = 4;

    var easeOutArray = [];
    var easeInArray = [];

    // Ensure influence is clamped between 0.1 and 100
    influenceIn = Math.max(0.1, Math.min(100, influenceIn));
    influenceOut = Math.max(0.1, Math.min(100, influenceOut));

    if (isSpatial) {
        // Calculate average speed for spatial path
        var distSq = 0;
        for (var d = 0; d < dims; d++) {
            distSq += Math.pow(val2[d] - val1[d], 2);
        }
        var totalDist = Math.sqrt(distSq);
        var avgSpeed = totalDist / timeDiff;

        // Map UI speed (0-100) to actual pixels/sec. 50 UI = 1x avgSpeed.
        var actualSpeedOut = (speedOut / 50) * avgSpeed;
        var actualSpeedIn = (speedIn / 50) * avgSpeed;

        easeOutArray.push(new KeyframeEase(actualSpeedOut, influenceOut));
        easeInArray.push(new KeyframeEase(actualSpeedIn, influenceIn));
    } else {
        // Non-spatial properties need an array of KeyframeEase equal to their dimension
        for (var d = 0; d < dims; d++) {
            var v1 = (dims === 1) ? val1 : val1[d];
            var v2 = (dims === 1) ? val2 : val2[d];
            var valDiff = v2 - v1;
            var avgSpeed = valDiff / timeDiff;

            var actualSpeedOut = (speedOut / 50) * Math.abs(avgSpeed);
            var actualSpeedIn = (speedIn / 50) * Math.abs(avgSpeed);

            // If the value is decreasing, AE needs negative speed
            if (valDiff < 0) {
                actualSpeedOut = -actualSpeedOut;
                actualSpeedIn = -actualSpeedIn;
            }

            easeOutArray.push(new KeyframeEase(actualSpeedOut, influenceOut));
            easeInArray.push(new KeyframeEase(actualSpeedIn, influenceIn));
        }
    }

    prop.setInterpolationTypeAtKey(key1Index, prop.keyInInterpolationType(key1Index), KeyframeInterpolationType.BEZIER);
    prop.setInterpolationTypeAtKey(key2Index, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(key2Index));

    var key1InEase = prop.keyInTemporalEase(key1Index);
    var key2OutEase = prop.keyOutTemporalEase(key2Index);

    prop.setTemporalEaseAtKey(key1Index, key1InEase, easeOutArray);
    prop.setTemporalEaseAtKey(key2Index, easeInArray, key2OutEase);
}

/**
 * Opens AE's native color picker which supports the eyedropper outside CEF.
 */
function getAEColorPicker(hexColor) {
    try {
        var initialColor = 0;
        if (hexColor && hexColor.indexOf("#") !== -1) {
            initialColor = parseInt(hexColor.replace("#", ""), 16);
        }
        var pickedColor = $.colorPicker(initialColor);
        if (pickedColor === -1) {
            return "CANCELLED";
        }
        var hexOut = pickedColor.toString(16);
        while (hexOut.length < 6) {
            hexOut = "0" + hexOut;
        }
        return "#" + hexOut;
    } catch (e) {
        return "ERROR";
    }
}

// ==========================================
// LAYER & TIMELINE TOOLS
// ==========================================

function trimLayerLeft() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) return "error";

        app.beginUndoGroup("Trim Layer Left");
        for (var i = 0; i < selLayers.length; i++) {
            selLayers[i].inPoint = comp.time;
        }
        app.endUndoGroup();
        return "true";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function trimLayerRight() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) return "error";

        app.beginUndoGroup("Trim Layer Right");
        for (var i = 0; i < selLayers.length; i++) {
            selLayers[i].outPoint = comp.time;
        }
        app.endUndoGroup();
        return "true";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function splitLayerAtCTI() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) return "error";

        app.beginUndoGroup("Split Layer");
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            if (comp.time > layer.inPoint && comp.time < layer.outPoint) {
                var newLayer = layer.duplicate();
                layer.outPoint = comp.time;
                newLayer.inPoint = comp.time;
            }
        }
        app.endUndoGroup();
        return "true";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function goToPrevMarker() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        var markerProp = comp.markerProperty;
        if (!markerProp || markerProp.numKeys === 0) return "error";
        
        var targetTime = -1;
        for (var i = markerProp.numKeys; i >= 1; i--) {
            var mTime = markerProp.keyTime(i);
            if (mTime < comp.time - 0.001) {
                targetTime = mTime;
                break;
            }
        }
        
        if (targetTime !== -1) {
            comp.time = targetTime;
            return "true";
        }
        return "error";
    } catch (e) {
        return "error";
    }
}

function goToNextMarker() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        var markerProp = comp.markerProperty;
        if (!markerProp || markerProp.numKeys === 0) return "error";
        
        var targetTime = -1;
        for (var i = 1; i <= markerProp.numKeys; i++) {
            var mTime = markerProp.keyTime(i);
            if (mTime > comp.time + 0.001) {
                targetTime = mTime;
                break;
            }
        }
        
        if (targetTime !== -1) {
            comp.time = targetTime;
            return "true";
        }
        return "error";
    } catch (e) {
        return "error";
    }
}
