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

## About the project

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

## Deployment

The frontend is now built with relative asset paths, so it can be hosted from GitHub Pages or any other static file host.

If you want the map data to load on GitHub Pages, point the frontend at a live backend by setting `VITE_API_BASE_URL` at build time. Local development uses `frontend/.env`, and the Docker setup below passes the same value during build.

For GitHub Actions, add a repository variable named `VITE_API_BASE_URL` and set it to your Render endpoint, for example `https://your-app-name.onrender.com/api`.

To run the full stack locally in containers:

```bash
docker compose up --build
```

That starts the API on `http://localhost:5000` and the frontend on `http://localhost:3000`.
The backend Docker service listens on port `5000` internally so it matches `frontend/.env` and the Render port fallback.

## Releases

Whenever updates are made to `empireflow.geojson`, a new release is made according to the following MAJOR.MINOR.PATCH versioning system:

1. MAJOR version when incompatible changes are made to the GeoJSON structure
2. MINOR version when large edits are made e.g. new polities have been added
3. PATCH version when smaller edits are made e.g. existing polgons and years have been adjusted

Past releases can be found on the right hand side of this page.

## Maintainer docs

Information below is relevant to maintainers of the EmpireFlow repo.

### Making a release

If you wish to edit EmpireFlow and make a new release, do the following:

1. Ensure you have cloned the repo to your local machine:

    ```
        git clone https://github.com/Seshat-Global-History-Databank/empireflow
    ```

2. Unzip `empireflow.geojson.zip` to get `empireflow.geojson` and make the relevant modifications for the new release. If you wish to check the new version, you can inspect it in the Jupyter interactive plot (see [here](./notebooks)).

3. Rezip the file and resave it to `empireflow.geojson.zip`. 

4. Decide on a new version number based on the numbering system outlined above.

5. Commit the zip file with an informative commit message and create a tag with the version number:

    ```
        git add empireflow.geojson.zip
        git commit -m 'Update to vX.X.X'
        git tag vX.X.X
    ``` 

6. Push your updated zip file and the tag to GitHub:

    ```
        git push
        git push origin vX.X.X
    ```

7. On GitHub, click "Releases" (on the right of this page). Choose the tag you created and name the release the same i.e. `vX.X.X`. Enter any relevant info describing the changes in the release. The linked [Zenodo](https://zenodo.org/records/13363121) will automatically get updated with the latest release.

After making a new release, you may wish to update the Seshat website with the latest version of EmpireFlow. Contact a `Seshat Admin` who can follow [these instructions](https://seshat-global-history-databank.github.io/seshat/admin/setup/spatialdb.html#empireflow-shape-dataset).
