<p align="center">
  <img src="frontend/public/logo.svg" width="100"/>
</p>

# EmpireFlow

- [About the project](#about-the-project)
- [Data description](#data-description)
- [Visualising EmpireFlow](#visualising-empireflow)
- [Releases](#releases)
- [Maintainer docs](#maintainer-docs)
    - [Making a release](#making-a-release)

## About the project: [EmpireFlow](https://eric157.github.io/EmpireFlow/)

EmpireFlow is a comprehensive open-source geospatial dataset of worldwide polities from 3400BCE to 2024CE.  It is part of the [Seshat Global History Databank](https://seshatdatabank.info/) project.  Presently it comprises over 1600 political entities sampled at varying timesteps and spatial scales. Description of its initial format, construction, and source material may be found [here](https://osf.io/preprints/socarxiv/24wd6).  Released versions may be accessed here or [on Zenodo](https://zenodo.org/records/13363121).

*The [Seshat Global History Databank](https://seshat-db.com/) features EmpireFlow:*

* *[Seshat World Map](https://seshat-db.com/core/world_map)*
* *[Seshat Polity Pages](https://seshat-db.com/core/polity/71) (Roman Empire - Dominate)*

While we strive to reflect the most current historical knowledge, we acknowledge that these maps reflect only one version of the territory held by past polities. Border uncertainties, as well as differing opinions on the names, territorial changes, and durations of polities, are common challenges facing historians. We welcome feedback and suggestions for improvement. Following [standard Seshat protocol](https://seshatdatabank.info/methods/world-sample-30), any reported errors will be addressed after expert historian review.

Please note that users and analysts of this map data are solely responsible for assessing its suitability for their specific purposes.

## Data description

EmpireFlow is distributed as a single data file, `empireflow.geojson` (stored as a zip here due to GitHub's file size constraints).
This file currently consists of approximately 15K records.
Data for each entity (e.g., 'Roman Empire') is contained in one or more rows, depending on how the associated data about the entity changes.
Each row reports the **Name** of the entity, its polygons (**geometry**, projection EPSG:4326), that geometry's **Area** (in km<sup>2</sup> using equal-area projection EPSG:6933), and its **Type** (POLITY).

Each row indicates a range of years between **FromYear** to **ToYear** to which the associated row data applies.
Years are recorded as integers, negative for BCE, positive for CE.
Data, including polygons, for any entity for any year between 3400BCE and 2024CE can be obtained finding the row (if any) containing the **Name** of the entity where the year of interest is between the row’s **FromYear** and **ToYear**, inclusive.

Each row also records an associated **Wikipedia** page (phrase) describing the entity in those years; the latter URL can be composed by embedding the phrase in ``“http://en.wikipedia.org/<phrase>”``.
For certain polities in particular years, an associated Seshat polity id (**SeshatID**) may be provided; access to
the structured data about that polity can be found via the URL `“http://seshat-db.org/core/polity/<polity
id>”`.

## Visualising EmpireFlow

You can explore the EmpireFlow dataset in an interactive Jupyter notebook. The [notebooks](./notebooks) folder contains a processing script to add colors to the dataset, alongside a notebook which loads the data in GeoPandas and includes an interactive Folium plot. This folder includes complete instructions for Python/GitHub beginners including setting up a virtual environment and cloning the repo. If you just want to add the colors to the GeoJSON, follow the instructions below.

**Quick start instructions for adding colors to the GeoJSON (after unzipping):**

```
    pip install -r notebooks/requirements.txt
    python notebooks/convert_data.py empireflow.geojson
```

You can also explore EmpireFlow on the Seshat website (see links [above](#about-the-project)).
