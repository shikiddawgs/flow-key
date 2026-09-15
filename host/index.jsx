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

// ==========================================
// BOUNCE / INERTIAL MOTION
// ==========================================

/**
 * Applies an inertial bounce expression to a transform property on all selected layers.
 * @param {string} propName - "Scale", "Position", or "Rotation"
 * @param {number} amp - Amplitude (e.g. 0.05)
 * @param {number} freq - Frequency (e.g. 3.0)
 * @param {number} decay - Decay (e.g. 4.5)
 */
function applyBounceExpression(propName, amp, freq, decay) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a composition.");
            return "error";
        }

        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }

        var expr = ""
            + "n = 0;\n"
            + "if (numKeys > 0){\n"
            + "  n = nearestKey(time).index;\n"
            + "  if (key(n).time > time) n--;\n"
            + "}\n"
            + "if (n == 0) { t = 0; } else { t = time - key(n).time; }\n"
            + "if (n > 0 && t < 1){\n"
            + "  v = velocityAtTime(key(n).time - thisComp.frameDuration/10);\n"
            + "  amp = " + amp + ";\n"
            + "  freq = " + freq + ";\n"
            + "  decay = " + decay + ";\n"
            + "  value + v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);\n"
            + "} else { value; }";

        app.beginUndoGroup("Apply Bounce");

        var applied = 0;
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var prop = null;

            if (propName === "Scale") prop = layer.transform.scale;
            else if (propName === "Position") prop = layer.transform.position;
            else if (propName === "Rotation") {
                // Use Z Rotation for 3D layers, Rotation for 2D
                if (layer.threeDLayer) {
                    prop = layer.transform.zRotation;
                } else {
                    prop = layer.transform.rotation;
                }
            }

            if (prop) {
                prop.expression = expr;
                applied++;
            }
        }

        app.endUndoGroup();

        if (applied === 0) return "error";
        return "true";
    } catch (e) {
        alert("Error applying bounce: " + e.toString());
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

/**
 * Removes the expression from a transform property on all selected layers.
 * @param {string} propName - "Scale", "Position", or "Rotation"
 */
function removeBounceExpression(propName) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a composition.");
            return "error";
        }

        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }

        app.beginUndoGroup("Remove Bounce");

        var removed = 0;
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var prop = null;

            if (propName === "Scale") prop = layer.transform.scale;
            else if (propName === "Position") prop = layer.transform.position;
            else if (propName === "Rotation") {
                if (layer.threeDLayer) {
                    prop = layer.transform.zRotation;
                } else {
                    prop = layer.transform.rotation;
                }
            }

            if (prop && prop.expression !== "") {
                prop.expression = "";
                removed++;
            }
        }

        app.endUndoGroup();

        if (removed === 0) return "error";
        return "true";
    } catch (e) {
        alert("Error removing bounce: " + e.toString());
        if (app.project) app.endUndoGroup();
        return "error";
    }
}


// ==========================================
// LAYER CREATION
// ==========================================

function createSmartNull() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";

        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }

        app.beginUndoGroup("Create Smart Null");
        
        var has3D = false;
        
        var nullLayer = comp.layers.addNull(comp.duration);
        nullLayer.name = "Null Control";
        nullLayer.position.setValue([comp.width/2, comp.height/2]);
        
        if (selLayers.length > 0) {
            for (var i = 0; i < selLayers.length; i++) {
                if (selLayers[i].threeDLayer) has3D = true;
                selLayers[i].parent = nullLayer;
            }
        }
        
        if (has3D) nullLayer.threeDLayer = true;
        
        if (selLayers.length > 0) {
            nullLayer.moveBefore(selLayers[0]);
        }
        
        app.endUndoGroup();
        return "true";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function createCamera() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";

        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }

        // Create the ScriptUI Dialog
        var win = new Window("dialog", "Select Camera Preset");
        win.orientation = "column";
        win.alignChildren = ["left", "top"];
        win.spacing = 15;
        win.margins = 16;
        
        var pnl = win.add("panel", undefined, "");
        pnl.orientation = "column";
        pnl.alignChildren = ["left", "top"];
        pnl.margins = 15;
        
        pnl.add("statictext", undefined, "Choose Camera Preset:");
        var presets = ["15 mm", "20 mm", "24 mm", "28 mm", "35 mm", "50 mm", "85 mm", "100 mm", "135 mm", "200 mm"];
        var drop = pnl.add("dropdownlist", undefined, presets);
        drop.selection = 5; // Default 50mm
        drop.preferredSize.width = 200;
        
        var btnGrp = win.add("group");
        btnGrp.orientation = "row";
        btnGrp.alignChildren = ["center", "center"];
        btnGrp.alignment = ["center", "top"];
        var btnOk = btnGrp.add("button", undefined, "OK");
        var btnCancel = btnGrp.add("button", undefined, "Cancel");
        
        var presetVal = 50;
        
        btnOk.onClick = function() {
            var str = drop.selection.text;
            presetVal = parseInt(str.split(" ")[0]);
            win.close(1);
        };
        btnCancel.onClick = function() {
            win.close(0);
        };
        
        if (win.show() === 1) {
            app.beginUndoGroup("Create Camera");
            var selLayers = comp.selectedLayers;
            
            var cam = comp.layers.addCamera("Camera " + presetVal + "mm", [comp.width/2, comp.height/2]);
            var zoom = (comp.width * presetVal) / 36;
            if (cam.property("Zoom")) cam.property("Zoom").setValue(zoom);
            if (cam.transform.position) cam.transform.position.setValue([comp.width/2, comp.height/2, -zoom]);
            
            if (selLayers.length > 0) {
                for (var i = 0; i < selLayers.length; i++) {
                    if (!selLayers[i].threeDLayer) {
                        selLayers[i].threeDLayer = true;
                    }
                }
            }
            
            app.endUndoGroup();
            return "true";
        }
        return "false";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function createAdjustmentLayer() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }
        
        app.beginUndoGroup("Create Adjustment Layer");
        var adj = comp.layers.addSolid([1,1,1], "Adjustment Layer", comp.width, comp.height, comp.pixelAspect, comp.duration);
        adj.adjustmentLayer = true;
        adj.startTime = 0;
        
        if (selLayers.length > 0) {
            adj.moveBefore(selLayers[0]);
        }
        
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function createSolid() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }
        
        app.beginUndoGroup("Create Solid");
        var solid = comp.layers.addSolid([0.5, 0.5, 0.5], "Solid", comp.width, comp.height, comp.pixelAspect, comp.duration);
        solid.startTime = 0;
        
        if (selLayers.length > 0) {
            solid.moveBefore(selLayers[0]);
        }
        
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function createTextLayer() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        app.beginUndoGroup("Create Text Layer");
        var textLayer = comp.layers.addText("TEXT");
        textLayer.position.setValue([comp.width/2, comp.height/2]);
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function fitLayerToComp() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }
        
        app.beginUndoGroup("Fit to Comp");
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            if (layer.source && layer.transform.scale) {
                var w = layer.source.width;
                var h = layer.source.height;
                var scaleX = (comp.width / w) * 100;
                var scaleY = (comp.height / h) * 100;
                layer.transform.scale.setValue([scaleX, scaleY, layer.threeDLayer ? 100 : 0]);
                layer.transform.position.setValue([comp.width/2, comp.height/2, layer.threeDLayer ? 0 : 0]);
            }
        }
        app.endUndoGroup();
        return "true";
    } catch (e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

// ==========================================
// QUICK SHAPE TOOLS
// ==========================================

function buildShapePath(shapeName, size) {
    var shape = new Shape();
    var w2 = size/2;
    var h2 = size/2;
    
    var inT = [];
    var outT = [];
    var pts = [];
    
    if (shapeName === "Rectangle" || shapeName === "Rounded") {
        pts = [[-w2, -h2], [w2, -h2], [w2, h2], [-w2, h2]];
        inT = [[0,0],[0,0],[0,0],[0,0]];
        outT = [[0,0],[0,0],[0,0],[0,0]];
        shape.closed = true;
    } else if (shapeName === "Ellipse") {
        var k = w2 * 0.55228;
        pts = [[0, -h2], [w2, 0], [0, h2], [-w2, 0]];
        inT = [[-k, 0], [0, -k], [k, 0], [0, k]];
        outT = [[k, 0], [0, k], [-k, 0], [0, -k]];
        shape.closed = true;
    } else if (shapeName === "Polygon") {
        for (var i = 0; i < 5; i++) {
            var angle = (i * 2 * Math.PI / 5) - Math.PI / 2;
            pts.push([Math.cos(angle) * w2, Math.sin(angle) * h2]);
            inT.push([0,0]);
            outT.push([0,0]);
        }
        shape.closed = true;
    } else if (shapeName === "Star") {
        for (var i = 0; i < 10; i++) {
            var angle = (i * Math.PI / 5) - Math.PI / 2;
            var rad = (i % 2 === 0) ? w2 : w2 / 2;
            pts.push([Math.cos(angle) * rad, Math.sin(angle) * rad]);
            inT.push([0,0]);
            outT.push([0,0]);
        }
        shape.closed = true;
    }
    
    shape.vertices = pts;
    shape.inTangents = inT;
    shape.outTangents = outT;
    return shape;
}

function createShapeLayer(shapeName) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        
        var selLayers = comp.selectedLayers;
        var iterations = selLayers.length > 0 ? selLayers.length : 1;
        
        app.beginUndoGroup("Create Shape - " + shapeName);
        
        for (var i = 0; i < iterations; i++) {
            var targetLayer = selLayers.length > 0 ? selLayers[i] : null;
            
            var shapeLayer = comp.layers.addShape();
            shapeLayer.name = shapeName + (targetLayer ? " (" + targetLayer.name + ")" : "");
            
            var shapeGroup = shapeLayer.property("ADBE Root Vectors Group");
            
            var bounds = { left: -200, top: -200, width: 400, height: 400 };
            if (targetLayer) {
                bounds = targetLayer.sourceRectAtTime(comp.time, false);
                if (bounds.width <= 0) bounds.width = 400;
                if (bounds.height <= 0) bounds.height = 400;
            }
            
            var w = bounds.width;
            var h = bounds.height;
            var minSize = Math.min(w, h);
            
            var centerX = bounds.left + w/2;
            var centerY = bounds.top + h/2;
            
            var shapePosProp = null;
            
            if (shapeName === "Rectangle") {
                var rect = shapeGroup.addProperty("ADBE Vector Shape - Rect");
                rect.property("ADBE Vector Rect Size").setValue([w, h]);
                shapePosProp = rect.property("ADBE Vector Rect Position");
            } else if (shapeName === "Rounded") {
                var rect = shapeGroup.addProperty("ADBE Vector Shape - Rect");
                rect.property("ADBE Vector Rect Size").setValue([w, h]);
                rect.property("ADBE Vector Rect Roundness").setValue(Math.min(w, h) * 0.1);
                shapePosProp = rect.property("ADBE Vector Rect Position");
            } else if (shapeName === "Ellipse") {
                var ellipse = shapeGroup.addProperty("ADBE Vector Shape - Ellipse");
                ellipse.property("ADBE Vector Ellipse Size").setValue([w, h]);
                shapePosProp = ellipse.property("ADBE Vector Ellipse Position");
            } else if (shapeName === "Polygon") {
                var star = shapeGroup.addProperty("ADBE Vector Shape - Star");
                star.property("ADBE Vector Star Type").setValue(2);
                star.property("ADBE Vector Star Points").setValue(5);
                star.property("ADBE Vector Star Outer Radius").setValue(minSize / 2);
                shapePosProp = star.property("ADBE Vector Star Position");
            } else if (shapeName === "Star") {
                var star = shapeGroup.addProperty("ADBE Vector Shape - Star");
                star.property("ADBE Vector Star Type").setValue(1);
                star.property("ADBE Vector Star Points").setValue(5);
                star.property("ADBE Vector Star Outer Radius").setValue(minSize / 2);
                star.property("ADBE Vector Star Inner Radius").setValue(minSize / 4);
                shapePosProp = star.property("ADBE Vector Star Position");
            }
            
            if (shapePosProp && targetLayer) {
                shapePosProp.setValue([centerX, centerY]);
            }
            
            var fill = shapeGroup.addProperty("ADBE Vector Graphic - Fill");
            try { fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]); } catch(e){}
            
            var stroke = shapeGroup.addProperty("ADBE Vector Graphic - Stroke");
            try { stroke.property("ADBE Vector Stroke Color").setValue([1, 0.165, 0.46]); } catch(e){}
            try { stroke.property("ADBE Vector Stroke Width").setValue(4); } catch(e){}
            
            if (targetLayer) {
                shapeLayer.parent = targetLayer.parent;
                shapeLayer.transform.anchorPoint.setValue(targetLayer.transform.anchorPoint.value);
                shapeLayer.transform.position.setValue(targetLayer.transform.position.value);
                shapeLayer.transform.scale.setValue(targetLayer.transform.scale.value);
                shapeLayer.transform.rotation.setValue(targetLayer.transform.rotation.value);
                shapeLayer.transform.opacity.setValue(targetLayer.transform.opacity.value);
                
                if (targetLayer.threeDLayer) {
                    shapeLayer.threeDLayer = true;
                    try { shapeLayer.transform.xRotation.setValue(targetLayer.transform.xRotation.value); } catch(e){}
                    try { shapeLayer.transform.yRotation.setValue(targetLayer.transform.yRotation.value); } catch(e){}
                    try { shapeLayer.transform.zRotation.setValue(targetLayer.transform.zRotation.value); } catch(e){}
                    try { shapeLayer.transform.orientation.setValue(targetLayer.transform.orientation.value); } catch(e){}
                }
                
                shapeLayer.moveBefore(targetLayer);
            } else {
                shapeLayer.position.setValue([comp.width/2, comp.height/2]);
            }
        }
        
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

function addMaskToLayer(shapeName) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }
        
        app.beginUndoGroup("Add Mask - " + shapeName);
        
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var maskGroup = layer.property("ADBE Mask Parade");
            var newMask = maskGroup.addProperty("ADBE Mask Atom");
            newMask.maskMode = MaskMode.ADD;
            
            var maskShapeProp = newMask.property("ADBE Mask Shape");
            
            var bounds = layer.sourceRectAtTime(comp.time, false);
            var w = bounds.width;
            var h = bounds.height;
            var size = Math.min(w, h);
            if (size <= 0) size = 400;
            
            var shapeObj = buildShapePath(shapeName, size);
            
            var centerX = bounds.left + w/2;
            var centerY = bounds.top + h/2;
            
            var verts = shapeObj.vertices;
            for (var v = 0; v < verts.length; v++) {
                verts[v][0] += centerX;
                verts[v][1] += centerY;
            }
            shapeObj.vertices = verts;
            
            maskShapeProp.setValue(shapeObj);
        }
        
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}

// ==========================================
// ANCHOR POINT
// ==========================================

function setAnchorPoint(alignX, alignY) {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "error";
        var selLayers = comp.selectedLayers;
        if (selLayers.length === 0) {
            alert("Please select at least one layer.");
            return "error";
        }
        
        app.beginUndoGroup("Set Anchor Point");
        
        for (var i = 0; i < selLayers.length; i++) {
            var layer = selLayers[i];
            var aProp = layer.transform.anchorPoint;
            var pProp = layer.transform.position;
            
            if (!aProp || !pProp) continue;
            
            var bounds = layer.sourceRectAtTime(comp.time, false);
            
            var targetX = bounds.left;
            if (alignX === "center") targetX += bounds.width / 2;
            else if (alignX === "right") targetX += bounds.width;
            
            var targetY = bounds.top;
            if (alignY === "center") targetY += bounds.height / 2;
            else if (alignY === "bottom") targetY += bounds.height;
            
            var oldAnchor = aProp.value;
            var newAnchor = [targetX, targetY, oldAnchor.length > 2 ? oldAnchor[2] : 0];
            
            // Calculate delta in local space
            var deltaX = newAnchor[0] - oldAnchor[0];
            var deltaY = newAnchor[1] - oldAnchor[1];
            var deltaZ = newAnchor[2] - (oldAnchor.length > 2 ? oldAnchor[2] : 0);
            
            // Hack to find vector in parent space using expression
            var tempEffect = layer.property("ADBE Effect Parade").addProperty("ADBE Point3D Control");
            var ptProp = tempEffect.property(1);
            var vecExp = "try { L = thisLayer; delta = [" + deltaX + "," + deltaY + "," + deltaZ + "]; if (L.hasParent) { L.parent.fromCompVec(L.toCompVec(delta)); } else { L.toCompVec(delta); } } catch(e) { [0,0,0] }";
            ptProp.expression = vecExp;
            var deltaParent = ptProp.valueAtTime(comp.time, false);
            tempEffect.remove();
            
            // Set new anchor
            if (aProp.numKeys > 0) {
                aProp.setValueAtTime(comp.time, newAnchor);
            } else {
                aProp.setValue(newAnchor);
            }
            
            // Set new position to compensate
            var oldPos = pProp.numKeys > 0 ? pProp.valueAtTime(comp.time, false) : pProp.value;
            var newPos = [oldPos[0] + deltaParent[0], oldPos[1] + deltaParent[1], oldPos.length > 2 ? oldPos[2] + deltaParent[2] : 0];
            
            if (pProp.numKeys > 0) {
                if (pProp.dimensionsSeparated) {
                    var xProp = layer.transform.xPosition;
                    var yProp = layer.transform.yPosition;
                    var zProp = layer.transform.zPosition;
                    if (xProp.numKeys > 0) xProp.setValueAtTime(comp.time, newPos[0]);
                    else xProp.setValue(newPos[0]);
                    
                    if (yProp.numKeys > 0) yProp.setValueAtTime(comp.time, newPos[1]);
                    else yProp.setValue(newPos[1]);
                    
                    if (zProp && layer.threeDLayer) {
                        if (zProp.numKeys > 0) zProp.setValueAtTime(comp.time, newPos[2]);
                        else zProp.setValue(newPos[2]);
                    }
                } else {
                    pProp.setValueAtTime(comp.time, newPos);
                }
            } else {
                if (pProp.dimensionsSeparated) {
                    layer.transform.xPosition.setValue(newPos[0]);
                    layer.transform.yPosition.setValue(newPos[1]);
                    if (layer.threeDLayer) layer.transform.zPosition.setValue(newPos[2]);
                } else {
                    pProp.setValue(newPos);
                }
            }
        }
        
        app.endUndoGroup();
        return "true";
    } catch(e) {
        if (app.project) app.endUndoGroup();
        return "error";
    }
}
