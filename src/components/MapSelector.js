import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Marker } from 'react-leaflet';
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
    name: 'Service Area 1',
    adderType: 'percentage',
    adderAmount: 0,
    geoJSON: null,
    isDrawing: true,
    isEditing: false
};

const MapSelector = () => {
    const [layers, setLayers] = useState([DEFAULT_LAYER]);
    const [activeLayerId, setActiveLayerId] = useState(1);
    const [testPoint, setTestPoint] = useState(null);
    const [isInside, setIsInside] = useState(null);
    const [editingLayerName, setEditingLayerName] = useState(null);
    const [showJSON, setShowJSON] = useState(false);
    const featureGroupRef = useRef();

    // Clear the map when switching layers or modes
    useEffect(() => {
        if (featureGroupRef.current) {
            featureGroupRef.current.clearLayers();
            
            // If the active layer has geoJSON, add it to the map
            const activeLayer = layers.find(l => l.id === activeLayerId);
            if (activeLayer?.geoJSON) {
                const layer = L.geoJSON(activeLayer.geoJSON);
                layer.addTo(featureGroupRef.current);
            }
        }
    }, [activeLayerId, layers]);

    // CRUD Operations
    const createLayer = () => {
        const newId = Math.max(...layers.map(l => l.id)) + 1;
        const newLayer = {
            id: newId,
            name: `Service Area ${newId}`,
            adderType: 'percentage',
            adderAmount: 0,
            geoJSON: null,
            isDrawing: true,
            isEditing: false
        };
        setLayers(prevLayers => prevLayers.map(layer => ({
            ...layer,
            isDrawing: false,
            isEditing: false
        })).concat(newLayer));
        setActiveLayerId(newId);
    };

    const updateLayer = (layerId, updates) => {
        setLayers(layers.map(layer =>
            layer.id === layerId ? { ...layer, ...updates } : layer
        ));
    };

    const deleteLayer = (layerId) => {
        setLayers(layers.filter(layer => layer.id !== layerId));
        if (activeLayerId === layerId) {
            setActiveLayerId(layers[0]?.id || null);
        }
    };

    const startDrawing = (layerId) => {
        // Clear any existing layers first
        if (featureGroupRef.current) {
            featureGroupRef.current.clearLayers();
        }
        
        setLayers(layers.map(layer => ({
            ...layer,
            isDrawing: layer.id === layerId,
            isEditing: false
        })));
        setActiveLayerId(layerId);
    };

    const startEditing = (layerId) => {
        setLayers(layers.map(layer => ({
            ...layer,
            isEditing: layer.id === layerId,
            isDrawing: false
        })));
        setActiveLayerId(layerId);
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

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    };

    const handleCreated = (e) => {
        const layer = e.layer;
        const geoJSON = layer.toGeoJSON();
        const targetLayer = layers.find(l => l.isDrawing) || layers.find(l => l.id === activeLayerId);
        if (targetLayer) {
            updateLayer(targetLayer.id, { 
                geoJSON,
                isDrawing: false
            });
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

    return (
        <div className="map-container">
            <MapContainer
                center={[51.505, -0.09]}
                zoom={13}
                style={{ height: '500px', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {layers.map(layer => (
                    <FeatureGroup 
                        key={layer.id}
                        ref={layer.id === activeLayerId ? featureGroupRef : null}
                    >
                        {layer.id === activeLayerId && (
                            <EditControl
                                position="topright"
                                onCreated={handleCreated}
                                onEdited={handleEdited}
                                onDeleted={handleDeleted}
                                draw={{
                                    rectangle: false,
                                    polygon: layer.isDrawing,
                                    circle: false,
                                    circlemarker: false,
                                    marker: false,
                                    polyline: false,
                                }}
                                edit={{
                                    edit: layer.isEditing,
                                    remove: false,
                                    featureGroup: featureGroupRef.current
                                }}
                            />
                        )}
                    </FeatureGroup>
                ))}
                {testPoint && (
                    <Marker position={[testPoint[0], testPoint[1]]} />
                )}
                <div className="map-layers-control">
                    {layers.map(layer => (
                        <div 
                            key={layer.id} 
                            className={`layer-item ${activeLayerId === layer.id ? 'active' : ''}`}
                        >
                            <div className="layer-header">
                                <div className="layer-title" onClick={() => setActiveLayerId(layer.id)}>
                                    {editingLayerName === layer.id ? (
                                        <input
                                            type="text"
                                            value={layer.name}
                                            onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                                            onBlur={() => setEditingLayerName(null)}
                                            autoFocus
                                        />
                                    ) : (
                                        <span onDoubleClick={() => setEditingLayerName(layer.id)}>
                                            {layer.name}
                                        </span>
                                    )}
                                </div>
                                <div className="layer-actions">
                                    {!layer.geoJSON && (
                                        <button 
                                            className="action-btn draw-btn"
                                            onClick={() => startDrawing(layer.id)}
                                            title="Draw Area"
                                        >
                                            ✏️
                                        </button>
                                    )}
                                    {layer.geoJSON && (
                                        <>
                                            <button 
                                                className="action-btn edit-btn"
                                                onClick={() => startEditing(layer.id)}
                                                title="Edit Area"
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                className="action-btn delete-btn"
                                                onClick={() => updateLayer(layer.id, { geoJSON: null })}
                                                title="Delete Area"
                                            >
                                                🗑️
                                            </button>
                                        </>
                                    )}
                                    <button 
                                        className="delete-layer-btn"
                                        onClick={() => deleteLayer(layer.id)}
                                        title="Delete Layer"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                            <div className="layer-settings">
                                <select 
                                    value={layer.adderType}
                                    onChange={(e) => updateLayer(layer.id, { adderType: e.target.value })}
                                >
                                    <option value="percentage">Percentage</option>
                                    <option value="perSquare">Per Square</option>
                                    <option value="flatFee">Flat Fee</option>
                                </select>
                                <input
                                    type="number"
                                    value={layer.adderAmount}
                                    onChange={(e) => updateLayer(layer.id, { adderAmount: parseFloat(e.target.value) })}
                                    step="0.01"
                                />
                            </div>
                        </div>
                    ))}
                    <button className="add-layer-btn" onClick={createLayer}>
                        Add New Service Area
                    </button>
                </div>
            </MapContainer>

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