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

        // Apply the SAME ease to all spatial dimensions
        for (var d = 0; d < dims; d++) {
            easeOutArray.push(new KeyframeEase(easeOutSpeed, easeOutInfluence));
            easeInArray.push(new KeyframeEase(easeInSpeed, easeInInfluence));
        }
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
