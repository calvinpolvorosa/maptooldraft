import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Marker, useMap, ZoomControl, useMapEvents } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import './MapSelector.css';

// Fix for the default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const DEFAULT_LAYER = {
    id: 1,
    name: 'Base Territory',
    adderType: 'percentage',
    adderAmount: null,
    geoJSON: null,
    isDrawing: false,
    isEditing: false
};

// Add this new component to handle map recenter
const RecenterMap = ({ position }) => {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.setView(position);
        }
    }, [position, map]);
    return null;
};

// Create a new component to handle editing
const EditHandler = ({ layer, featureGroup, onUpdate, onCancel }) => {
    const map = useMap();
    
    useEffect(() => {
        if (layer.isEditing && featureGroup && layer.geoJSON) {
            // Store original GeoJSON for cancel functionality
            const originalGeoJSON = layer.geoJSON;
            
            // Clear existing layers
            featureGroup.clearLayers();
            
            // Create a new polygon directly from GeoJSON coordinates
            const coordinates = layer.geoJSON.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
            
            // Create the editable polygon with styling
            const polygon = new L.Polygon(coordinates, {
                color: '#2557a7',
                weight: 3,
                opacity: 0.8,
                fillColor: '#f5f8ff',
                fillOpacity: 0.3
            });

            // Add to map
            polygon.addTo(map);

            // Create edit handler with custom vertex and middle marker options
            const editHandler = new L.Edit.Poly(polygon, {
                poly: {
                    allowIntersection: false
                },
                icon: L.divIcon({
                    className: 'vertex-marker',
                    iconSize: new L.Point(15, 15),
                    iconAnchor: new L.Point(7.5, 7.5)
                }),
                vertexMarkerClass: L.Marker.extend({
                    options: {
                        draggable: true,
                        icon: L.divIcon({
                            className: 'vertex-marker',
                            iconSize: new L.Point(15, 15),
                            iconAnchor: new L.Point(7.5, 7.5)
                        })
                    }
                }),
                middleMarkerClass: L.Marker.extend({
                    options: {
                        draggable: true,
                        icon: L.divIcon({
                            className: 'midpoint-marker',
                            iconSize: new L.Point(12, 12),
                            iconAnchor: new L.Point(6, 6)
                        })
                    }
                })
            });

            // Enable editing
            editHandler.enable();

            // Handle save
            const handleSave = () => {
                const latLngs = polygon.getLatLngs()[0];
                const newCoordinates = latLngs.map(latLng => [latLng.lng, latLng.lat]);
                const newGeoJSON = {
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [newCoordinates]
                    },
                    properties: {}
                };
                
                editHandler.disable();
                map.removeLayer(polygon);
                
                onUpdate(layer.id, {
                    geoJSON: newGeoJSON,
                    isEditing: false
                });
            };

            // Add save button listener
            const saveButton = document.querySelector('.action-btn.edit-btn.active');
            if (saveButton) {
                saveButton.addEventListener('click', handleSave);
            }

            // Add cancel button listener
            const cancelButton = document.querySelector('.action-btn.cancel-btn');
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    editHandler.disable();
                    map.removeLayer(polygon);
                    onCancel(layer.id, originalGeoJSON);
                });
            }

            // Update cleanup
            return () => {
                if (saveButton) {
                    saveButton.removeEventListener('click', handleSave);
                }
                if (cancelButton) {
                    cancelButton.removeEventListener('click', () => {
                        editHandler.disable();
                        map.removeLayer(polygon);
                        onCancel(layer.id, originalGeoJSON);
                    });
                }
                editHandler.disable();
                map.removeLayer(polygon);
            };
        }
    }, [map, layer.isEditing, layer.geoJSON, featureGroup, layer.id, onUpdate, onCancel]);

    return null;
};

// Add this new component to handle map clicks
const MapClickHandler = ({ isPlacingPoint, onMapClick }) => {
    useMapEvents({
        click: (e) => {
            if (isPlacingPoint) {
                onMapClick(e);
            }
        }
    });
    return null;
};

const MapSelector = () => {
    const [layers, setLayers] = useState([DEFAULT_LAYER]);
    const [activeLayerId, setActiveLayerId] = useState(1);
    const [testPoint, setTestPoint] = useState(null);
    const [isInside, setIsInside] = useState(null);
    const [editingLayerName, setEditingLayerName] = useState(null);
    const [showJSON, setShowJSON] = useState(false);
    const featureGroupRefs = useRef({});
    const [mapCenter, setMapCenter] = useState([51.505, -0.09]); // Default coordinates
    const [userLocation, setUserLocation] = useState(null);
    const [isPlacingPoint, setIsPlacingPoint] = useState(false);
    const [pointCoordinates, setPointCoordinates] = useState(null);
    const mapRef = useRef(null);
    const [hasFirstPolygon, setHasFirstPolygon] = useState(false);

    // Add useEffect to get user's location when component mounts
    useEffect(() => {
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setMapCenter([latitude, longitude]);
                    setUserLocation([latitude, longitude]);
                },
                (error) => {
                    console.warn("Error getting location:", error);
                    // Keep default coordinates if location access is denied
                }
            );
        }
    }, []);

    // Clear the map when switching layers or modes
    useEffect(() => {
        const activeRef = featureGroupRefs.current[activeLayerId];
        if (activeRef) {
            activeRef.clearLayers();
            
            // If the active layer has geoJSON, add it to the map
            const activeLayer = layers.find(l => l.id === activeLayerId);
            if (activeLayer?.geoJSON) {
                const layer = L.geoJSON(activeLayer.geoJSON);
                layer.addTo(activeRef);
            }
        }
    }, [activeLayerId, layers]);

    // CRUD Operations
    const createLayer = () => {
        const newId = Math.max(...layers.map(l => l.id)) + 1;
        const newLayer = {
            id: newId,
            name: `Extended Range ${newId - 1}`,
            adderType: 'percentage',
            adderAmount: 5,
            geoJSON: null,
            isDrawing: false,
            isEditing: false
        };
        setLayers(prevLayers => prevLayers.map(layer => ({
            ...layer,
            isDrawing: false,
            isEditing: false,
            ...(layer.id === 1 ? {
                name: 'Base Territory',
                adderAmount: null
            } : {})
        })).concat(newLayer));
        setActiveLayerId(newId);
    };

    const updateLayer = (layerId, updates) => {
        setLayers(layers.map(layer =>
            layer.id === layerId ? {
                ...layer,
                ...updates,
                ...(layer.id === 1 ? {
                    name: 'Base Territory',
                    adderAmount: null
                } : {})
            } : layer
        ));
    };

    const deleteLayer = (layerId) => {
        // If it's the first layer (Base Territory), just clear its data
        if (layerId === 1) {
            updateLayer(layerId, {
                geoJSON: null,
                isEditing: false,
                isDrawing: false
            });
            return;
        }
        
        // Otherwise, proceed with normal deletion
        setLayers(layers.filter(layer => layer.id !== layerId));
        if (activeLayerId === layerId) {
            setActiveLayerId(layers[0]?.id || null);
        }
    };

    const startDrawing = (layerId) => {
        // Clear any existing layers first
        const activeRef = featureGroupRefs.current[layerId];
        if (activeRef) {
            activeRef.clearLayers();
        }
        
        // Update layer states
        setLayers(prevLayers => prevLayers.map(layer => ({
            ...layer,
            isDrawing: layer.id === layerId,
            isEditing: false,
            geoJSON: layer.id === layerId ? null : layer.geoJSON
        })));
        setActiveLayerId(layerId);

        // Force EditControl to initialize and activate immediately
        setTimeout(() => {
            const editControl = document.querySelector('.leaflet-draw-draw-polygon');
            if (editControl) {
                editControl.click();
            }
        }, 0);
    };

    const startEditing = (layerId) => {
        setLayers(prevLayers => prevLayers.map(layer => ({
            ...layer,
            isEditing: layer.id === layerId,
            isDrawing: false
        })));
        setActiveLayerId(layerId);

        const activeRef = featureGroupRefs.current[layerId];
        if (activeRef) {
            // Clear and re-add the layer to ensure clean editing state
            activeRef.clearLayers();
            
            const activeLayer = layers.find(l => l.id === layerId);
            if (activeLayer?.geoJSON) {
                // Create the GeoJSON layer with editing enabled
                const geoJSONLayer = L.geoJSON(activeLayer.geoJSON, {
                    style: {
                        color: '#2557a7',
                        weight: 3,
                        opacity: 0.8,
                        fillColor: '#f5f8ff',
                        fillOpacity: 0.3
                    }
                });
                activeRef.addLayer(geoJSONLayer);
            }
        }
    };

    const finishEditing = (layerId) => {
        updateLayer(layerId, { isEditing: false });
    };

    // Export layers as JSON
    const getLayersJSON = () => {
        return layers.map(({ id, name, adderType, adderAmount, geoJSON }) => ({
            id,
            name,
            adderType,
            adderAmount,
            coordinates: geoJSON ? geoJSON.geometry.coordinates : null
        }));
    };

    // Point in polygon check
    const isPointInPolygon = (point, polygon) => {
        if (!point || !polygon) return false;
        
        const coordinates = polygon.geometry.coordinates[0];
        const x = point[1];
        const y = point[0];
        let inside = false;

        for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
            const xi = coordinates[i][0];
            const yi = coordinates[i][1];
            const xj = coordinates[j][0];
            const yj = coordinates[j][1];

            // Split the calculation into smaller parts for clarity
            const yCheck = (yi > y) !== (yj > y);
            const xIntersect = (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            const intersect = yCheck && xIntersect;
            
            if (intersect) {
                inside = !inside;
            }
        }

        return inside;
    };

    const handleCreated = (e) => {
        const layer = e.layer;
        layer.setStyle({
            color: '#2557a7',
            weight: 3,
            opacity: 0.8,
            fillColor: '#f5f8ff',
            fillOpacity: 0.3
        });
        const geoJSON = layer.toGeoJSON();
        const targetLayer = layers.find(l => l.isDrawing) || layers.find(l => l.id === activeLayerId);
        
        if (targetLayer) {
            updateLayer(targetLayer.id, { 
                geoJSON,
                isDrawing: false
            });
            setHasFirstPolygon(true);
            
            const activeRef = featureGroupRefs.current[targetLayer.id];
            if (activeRef) {
                activeRef.addLayer(layer);
            }
        }
    };

    const handleEdited = (e) => {
        const editedLayers = e.layers;
        editedLayers.eachLayer((layer) => {
            const geoJSON = layer.toGeoJSON();
            const editingLayer = layers.find(l => l.isEditing);
            if (editingLayer) {
                updateLayer(editingLayer.id, { 
                    geoJSON,
                    isEditing: false
                });
            }
        });
    };

    const handleDeleted = () => {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if (activeLayer) {
            updateLayer(activeLayerId, { 
                geoJSON: null,
                isEditing: false
            });
        }
        setIsInside(null);
    };

    const checkCoordinate = (e) => {
        e.preventDefault();
        const lat = parseFloat(e.target.latitude.value);
        const lng = parseFloat(e.target.longitude.value);
        
        if (isNaN(lat) || isNaN(lng)) {
            alert('Please enter valid coordinates');
            return;
        }

        const point = [lat, lng];
        setTestPoint(point);
        
        // Check against all layers and find applicable adders
        const applicableAdders = layers
            .filter(layer => layer.geoJSON)
            .filter(layer => isPointInPolygon(point, layer.geoJSON))
            .map(layer => ({
                name: layer.name,
                type: layer.adderType,
                amount: layer.adderAmount
            }));

        setIsInside(applicableAdders.length > 0 ? applicableAdders : null);
    };

    const cancelEditing = (layerId) => {
        const layer = layers.find(l => l.id === layerId);
        if (layer) {
            // Revert to original state and exit edit mode
            updateLayer(layerId, { 
                isEditing: false 
            });
            
            // Re-render the original polygon
            const activeRef = featureGroupRefs.current[layerId];
            if (activeRef) {
                activeRef.clearLayers();
                if (layer.geoJSON) {
                    const geoJSONLayer = L.geoJSON(layer.geoJSON);
                    activeRef.addLayer(geoJSONLayer);
                }
            }
        }
    };

    const LayerActionButton = ({ layer }) => {
        const hasPolygon = !!layer.geoJSON;
        const isEditing = layer.isEditing;
        const isDrawing = layer.isDrawing;
        
        const [drawToolActive, setDrawToolActive] = useState(false);

        useEffect(() => {
            const checkDrawToolStatus = () => {
                const drawControl = document.querySelector('.leaflet-draw-draw-polygon');
                const isEnabled = drawControl?.classList.contains('leaflet-draw-toolbar-button-enabled');
                // Only set active if this is the current layer and the draw tool is enabled
                setDrawToolActive(isEnabled && layer.id === activeLayerId);
            };

            checkDrawToolStatus();

            const observer = new MutationObserver(checkDrawToolStatus);
            observer.observe(document.body, { 
                subtree: true, 
                attributes: true, 
                attributeFilter: ['class'] 
            });

            return () => observer.disconnect();
        }, [isDrawing, layer.id, activeLayerId]); // Add activeLayerId to dependencies

        return (
            <div className="layer-actions">
                {hasPolygon ? (
                    <>
                        <button 
                            className={`action-btn edit-btn ${isEditing ? 'active' : ''}`}
                            onClick={() => {
                                if (isEditing) {
                                    finishEditing(layer.id);
                                } else {
                                    startEditing(layer.id);
                                }
                            }}
                        >
                            {isEditing ? 'Save' : 'Edit'}
                        </button>
                        <button 
                            className={`action-btn delete-btn`}
                            onClick={() => {
                                if (window.confirm('Are you sure you want to delete this polygon?')) {
                                    updateLayer(layer.id, { 
                                        geoJSON: null,
                                        isEditing: false,
                                        isDrawing: false 
                                    });
                                }
                            }}
                        >
                            Delete
                        </button>
                    </>
                ) : (
                    <>
                        <button 
                            className={`action-btn draw-btn ${(drawToolActive || isDrawing) ? 'active' : ''}`}
                            onClick={() => startDrawing(layer.id)}
                        >
                            Draw
                        </button>
                        {hasFirstPolygon && layer.id !== 1 && (
                            <button 
                                className={`action-btn ${isDrawing ? 'cancel-btn' : 'delete-btn'}`}
                                onClick={() => {
                                    if (isDrawing) {
                                        // Cancel drawing
                                        updateLayer(layer.id, { 
                                            isDrawing: false 
                                        });
                                    } else {
                                        // Delete layer
                                        if (window.confirm('Are you sure you want to delete this layer?')) {
                                            deleteLayer(layer.id);
                                        }
                                    }
                                }}
                            >
                                {isDrawing ? 'Cancel' : 'Delete'}
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    };

    useEffect(() => {
        // Function to set up event listeners
        const setupEventListeners = () => {
            const layersControl = document.querySelector('.map-layers-control');
            const layersWrapper = document.querySelector('.layers-wrapper');
            const mapContainer = document.querySelector('.leaflet-container');
            
            if (layersControl && layersWrapper && mapContainer) {
                const preventMapInteraction = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    mapContainer.style.pointerEvents = 'none';
                };

                const restoreMapInteraction = () => {
                    mapContainer.style.pointerEvents = 'auto';
                };

                const handleScroll = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const delta = e.deltaY;
                    layersWrapper.scrollTop += delta;
                };

                // Add event listeners
                layersControl.addEventListener('mouseenter', preventMapInteraction, { passive: false });
                layersControl.addEventListener('mouseleave', restoreMapInteraction, { passive: false });
                layersControl.addEventListener('wheel', handleScroll, { passive: false });
                layersControl.addEventListener('mousedown', preventMapInteraction, { passive: false });
                layersControl.addEventListener('mousemove', preventMapInteraction, { passive: false });
                layersControl.addEventListener('touchstart', preventMapInteraction, { passive: false });
                layersControl.addEventListener('touchmove', preventMapInteraction, { passive: false });

                // Return cleanup function
                return () => {
                    layersControl.removeEventListener('mouseenter', preventMapInteraction);
                    layersControl.removeEventListener('mouseleave', restoreMapInteraction);
                    layersControl.removeEventListener('wheel', handleScroll);
                    layersControl.removeEventListener('mousedown', preventMapInteraction);
                    layersControl.removeEventListener('mousemove', preventMapInteraction);
                    layersControl.removeEventListener('touchstart', preventMapInteraction);
                    layersControl.removeEventListener('touchmove', preventMapInteraction);
                };
            }
        };

        // Initial setup
        let cleanup = setupEventListeners();

        // Set up a mutation observer to watch for changes in the DOM
        const observer = new MutationObserver(() => {
            if (cleanup) cleanup();
            cleanup = setupEventListeners();
        });

        // Start observing the document with the configured parameters
        observer.observe(document.body, { 
            childList: true, 
            subtree: true 
        });

        // Cleanup function
        return () => {
            if (cleanup) cleanup();
            observer.disconnect();
        };
    }, []); // Empty dependency array means this runs once on mount

    return (
        <div className="map-container">
            <MapContainer
                ref={mapRef}
                center={mapCenter}
                zoom={13}
                style={{ height: '500px', width: '100%' }}
                zoomControl={true}
                doubleClickZoom={false}
            >
                <RecenterMap position={mapCenter} />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <ZoomControl position="topleft" />
                <MapClickHandler 
                    isPlacingPoint={isPlacingPoint}
                    onMapClick={(e) => {
                        const { lat, lng } = e.latlng;
                        setPointCoordinates([lat, lng]);
                        setIsPlacingPoint(false);
                        setTestPoint([lat, lng]);
                        
                        // Update the form inputs
                        const latInput = document.querySelector('input[name="latitude"]');
                        const lngInput = document.querySelector('input[name="longitude"]');
                        if (latInput && lngInput) {
                            latInput.value = lat.toFixed(6);
                            lngInput.value = lng.toFixed(6);
                        }
                    }}
                />
                {layers.map(layer => (
                    <FeatureGroup 
                        key={layer.id}
                        ref={element => {
                            if (element) {
                                featureGroupRefs.current[layer.id] = element;
                                // Update the style when the layer becomes active/inactive
                                if (element.getLayers().length > 0) {
                                    element.getLayers().forEach(polygon => {
                                        polygon.setStyle({
                                            color: activeLayerId === layer.id ? '#000000' : '#2557a7', // Black when active, blue when not
                                            weight: activeLayerId === layer.id ? 4 : 3,  // Slightly thicker when active
                                            opacity: 0.8,
                                            fillColor: '#f5f8ff',
                                            fillOpacity: 0.3
                                        });
                                    });
                                }
                            }
                        }}
                    >
                        {layer.id === activeLayerId && featureGroupRefs.current[layer.id] && (
                            <>
                                <EditHandler 
                                    layer={layer}
                                    featureGroup={featureGroupRefs.current[layer.id]}
                                    onUpdate={updateLayer}
                                    onCancel={cancelEditing}
                                />
                                {layer.isDrawing && (
                            <EditControl
                                position="topright"
                                onCreated={handleCreated}
                                draw={{
                                    rectangle: false,
                                            polygon: true,
                                    circle: false,
                                    circlemarker: false,
                                    marker: false,
                                    polyline: false,
                                }}
                                        edit={false}
                                    />
                                )}
                            </>
                        )}
                    </FeatureGroup>
                ))}
                {testPoint && (
                    <Marker position={testPoint} />
                )}
                <div className="map-layers-control right-menu">
                    <div className="layers-wrapper">
                    {layers.map(layer => (
                        <div 
                            key={layer.id} 
                            className={`layer-item ${activeLayerId === layer.id ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveLayerId(layer.id);
                                }}
                        >
                            <div className="layer-header">
                                        <input
                                            type="text"
                                        className="layer-name-input"
                                        value={layer.name || ''}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            updateLayer(layer.id, { name: e.target.value });
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.target.focus();
                                        }}
                                        onFocus={(e) => {
                                            e.stopPropagation();
                                            e.target.select();
                                        }}
                                        readOnly={false}
                                    />
                                    <LayerActionButton layer={layer} />
                                </div>
                                {layer.id !== 1 && (
                                    <div className="layer-controls">
                                <input
                                    type="number"
                                                value={layer.adderAmount || ''}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    const value = e.target.value;
                                                    // Limit to 4 digits
                                                    if (value.length <= 4) {
                                                        updateLayer(layer.id, { 
                                                            ...layer,
                                                            adderAmount: value === '' ? 0 : parseFloat(value) 
                                                        });
                                                    }
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.target.focus();
                                                }}
                                                onFocus={(e) => {
                                                    e.stopPropagation();
                                                    e.target.select();
                                                }}
                                                maxLength="4"
                                                min="0"
                                                max="9999"
                                                style={{ 
                                                    pointerEvents: 'auto',
                                                    userSelect: 'auto',
                                                    WebkitUserSelect: 'auto'
                                                }}
                                            />
                                            <select 
                                                value={layer.adderType || 'percentage'}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateLayer(layer.id, { 
                                                        ...layer,
                                                        adderType: e.target.value 
                                                    });
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Force the select to open
                                                    e.currentTarget.focus();
                                                    const evt = document.createEvent('MouseEvents');
                                                    evt.initMouseEvent('mousedown', true, true, window);
                                                    e.currentTarget.dispatchEvent(evt);
                                                }}
                                                onFocus={(e) => {
                                                    e.stopPropagation();
                                                }}
                                                onBlur={(e) => {
                                                    e.stopPropagation();
                                                }}
                                            >
                                                <option value="percentage">%</option>
                                                <option value="perSquare">$/SQ</option>
                                                <option value="flatFee">Flat Fee $</option>
                                            </select>
                                        </div>
                                    )}
                            </div>
                            ))}
                    </div>
                    {hasFirstPolygon && (
                        <div className="button-container">
                    <button className="add-layer-btn" onClick={createLayer}>
                                    Add Extended Range
                                    </button>
                                </div>
                    )}
                </div>
            </MapContainer>

            <div className="map-layers-control left-menu">
                <div className="layers-wrapper">
                {layers.map(layer => (
                    <div 
                        key={layer.id} 
                        className={`layer-item ${activeLayerId === layer.id ? 'active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveLayerId(layer.id);
                                }}
                    >
                        <div className="layer-header">
                                    <input
                                        type="text"
                                        className="layer-name-input"
                                        value={layer.name || ''}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            updateLayer(layer.id, { name: e.target.value });
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.target.focus();
                                        }}
                                        onFocus={(e) => {
                                            e.stopPropagation();
                                            e.target.select();
                                        }}
                                        readOnly={false}
                                    />
                                    <LayerActionButton layer={layer} />
                            </div>
                                {layer.id !== 1 && (
                                    <div className="layer-controls">
                                <input
                                    type="number"
                                                value={layer.adderAmount || ''}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    const value = e.target.value;
                                                    // Limit to 4 digits
                                                    if (value.length <= 4) {
                                                        updateLayer(layer.id, { 
                                                            ...layer,
                                                            adderAmount: value === '' ? 0 : parseFloat(value) 
                                                        });
                                                    }
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.target.focus();
                                                }}
                                                onFocus={(e) => {
                                                    e.stopPropagation();
                                                    e.target.select();
                                                }}
                                                maxLength="4"
                                                min="0"
                                                max="9999"
                                                style={{ 
                                                    pointerEvents: 'auto',
                                                    userSelect: 'auto',
                                                    WebkitUserSelect: 'auto'
                                                }}
                                            />
                                            <select 
                                                value={layer.adderType || 'percentage'}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    updateLayer(layer.id, { 
                                                        ...layer,
                                                        adderType: e.target.value 
                                                    });
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Force the select to open
                                                    e.currentTarget.focus();
                                                    const evt = document.createEvent('MouseEvents');
                                                    evt.initMouseEvent('mousedown', true, true, window);
                                                    e.currentTarget.dispatchEvent(evt);
                                                }}
                                                onFocus={(e) => {
                                                    e.stopPropagation();
                                                }}
                                                onBlur={(e) => {
                                                    e.stopPropagation();
                                                }}
                                            >
                                                <option value="percentage">%</option>
                                                <option value="perSquare">$/SQ</option>
                                                <option value="flatFee">Flat Fee $</option>
                                            </select>
                                        </div>
                                    )}
                            </div>
                            ))}
                        </div>
                        {hasFirstPolygon && (
                            <div className="button-container">
                    <button className="add-layer-btn" onClick={createLayer}>
                                    Add Extended Range
                    </button>
                </div>
                        )}
                    </div>

            <div className="coordinate-checker">
                <form onSubmit={checkCoordinate}>
                    <input
                        type="number"
                        step="any"
                        name="latitude"
                        placeholder="Latitude"
                        required
                    />
                    <input
                        type="number"
                        step="any"
                        name="longitude"
                        placeholder="Longitude"
                        required
                    />
                    <button 
                        type="button" 
                        className={`place-point-btn ${isPlacingPoint ? 'active' : ''}`}
                        onClick={() => {
                            setIsPlacingPoint(!isPlacingPoint);
                            if (isPlacingPoint) {
                                setTestPoint(null);
                                setPointCoordinates(null);
                                // Clear the form inputs
                                const latInput = document.querySelector('input[name="latitude"]');
                                const lngInput = document.querySelector('input[name="longitude"]');
                                if (latInput && lngInput) {
                                    latInput.value = '';
                                    lngInput.value = '';
                                }
                            }
                        }}
                    >
                        {isPlacingPoint ? 'Cancel Point' : 'Place Point'}
                    </button>
                    <button type="submit">Check Coordinate</button>
                </form>
            </div>

            {isInside && (
                <div className="result">
                    <h4>Applicable Service Areas:</h4>
                    {isInside.map((adder, index) => (
                        <div key={index} className="adder-info">
                            <strong>{adder.name}:</strong>{' '}
                            {adder.type === 'percentage' && `${adder.amount}%`}
                            {adder.type === 'perSquare' && `$${adder.amount}/sq`}
                            {adder.type === 'flatFee' && `$${adder.amount} flat fee`}
                        </div>
                    ))}
                </div>
            )}

            <div className="json-output">
                <button 
                    className="toggle-json-btn"
                    onClick={() => setShowJSON(!showJSON)}
                >
                    {showJSON ? 'Hide JSON' : 'Show JSON'}
                </button>
                {showJSON && (
                    <pre>
                        {JSON.stringify(getLayersJSON(), null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
};

export default MapSelector; 