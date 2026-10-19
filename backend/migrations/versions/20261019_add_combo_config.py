"""add combo_config to products and seed desayunos combos

Revision ID: 20261019_add_combo_config
Revises: 20261016_uploaded_images_table
Create Date: 2026-10-19 19:30:00

"""
import json
from alembic import op
import sqlalchemy as sa

revision = '20261019_add_combo_config'
down_revision = '20261016_uploaded_images_table'
branch_labels = None
depends_on = None

COMBOS_DATA = [
    {
        "id": "combo-simple-1",
        "name": "Combo Simple - Opción 1",
        "description": "Infusión, 2 medialunas, soda o jugo de naranja",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "drink",
                    "title": "Bebida para acompañar",
                    "required": True,
                    "type": "single",
                    "options": ["Soda", "Jugo de naranja"]
                }
            ]
        }
    },
    {
        "id": "combo-simple-2",
        "name": "Combo Simple - Opción 2",
        "description": "Infusión, 2 criollos o 2 tostadas, 2 untables, soda o jugo de naranja",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "bakery",
                    "title": "Panadería",
                    "required": True,
                    "type": "single",
                    "options": ["2 Criollos", "2 Tostadas"]
                },
                {
                    "id": "spreads",
                    "title": "Elegí 2 Untables",
                    "required": True,
                    "type": "multiple",
                    "min": 2,
                    "max": 2,
                    "options": ["Mermelada de durazno", "Mermelada de frutilla", "Manteca", "Queso crema", "Dulce de leche"]
                },
                {
                    "id": "drink",
                    "title": "Bebida para acompañar",
                    "required": True,
                    "type": "single",
                    "options": ["Soda", "Jugo de naranja"]
                }
            ]
        }
    },
    {
        "id": "combo-trad-licuado-tostado",
        "name": "Combo Tradicional: Licuado y Tostado",
        "description": "Licuado | tostado de jamón y queso",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "licuado_flavor",
                    "title": "Sabor del Licuado",
                    "required": True,
                    "type": "single",
                    "options": ["Banana", "Frutilla", "Durazno", "Mixto"]
                },
                {
                    "id": "licuado_base",
                    "title": "Elaboración del Licuado",
                    "required": True,
                    "type": "single",
                    "options": ["Con leche", "Con agua"]
                }
            ]
        }
    },
    {
        "id": "combo-trad-infusion-postre",
        "name": "Combo Tradicional: Infusión y Porción de Postre",
        "description": "Infusión | porción de postre o torta",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "dessert",
                    "title": "Porción de Torta o Postre",
                    "required": True,
                    "type": "single",
                    "options": ["Cheesecake de frutos rojos", "Brownie de chocolate", "Torta del día"]
                }
            ]
        }
    },
    {
        "id": "combo-trad-jugo-tostado",
        "name": "Combo Tradicional: Jugo de Naranja y Tostado",
        "description": "Vaso de jugo de naranja | tostado de jamón y queso",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "bread",
                    "title": "Tipo de Pan del Tostado",
                    "required": True,
                    "type": "single",
                    "options": ["Pan blanco", "Pan de salvado"]
                }
            ]
        }
    },
    {
        "id": "combo-americano",
        "name": "Combo Americano",
        "description": "Infusión | 2 tostadas | queso o mermelada | huevo revuelto | jamón y queso | jugo de naranja",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "spread",
                    "title": "Elegí tu Untable",
                    "required": True,
                    "type": "single",
                    "options": ["Queso crema", "Mermelada de durazno", "Mermelada de frutilla", "Manteca", "Dulce de leche"]
                }
            ]
        }
    },
    {
        "id": "combo-nanifer",
        "name": "Combo NaniFer",
        "description": "Infusión | 2 tostadas | untable | dip de palta | huevo revuelto | jugo de naranja",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "spread",
                    "title": "Elegí tu Untable",
                    "required": True,
                    "type": "single",
                    "options": ["Queso crema", "Mermelada de durazno", "Mermelada de frutilla", "Manteca", "Dulce de leche"]
                }
            ]
        }
    },
    {
        "id": "combo-supremo",
        "name": "Combo Supremo",
        "description": "Infusión | 2 tostadas | untable | dip de palta | huevo revuelto | ensalada de frutas | jugo de naranja",
        "category_id": "menu-desayunos",
        "public_categories": ["menu-desayunos"],
        "combo_config": {
            "is_combo": True,
            "steps": [
                {
                    "id": "infusion",
                    "title": "Elegí tu Infusión",
                    "required": True,
                    "type": "single",
                    "options": ["Café en jarrito", "Café cortado", "Café con leche", "Lágrima", "Submarino", "Té", "Mate cocido"]
                },
                {
                    "id": "spread",
                    "title": "Elegí tu Untable",
                    "required": True,
                    "type": "single",
                    "options": ["Queso crema", "Mermelada de durazno", "Mermelada de frutilla", "Manteca", "Dulce de leche"]
                }
            ]
        }
    }
]

def upgrade():
    conn = op.get_bind()
    columns = [c['name'] for c in sa.inspect(conn).get_columns('products')]
    if 'combo_config' not in columns:
        op.add_column('products', sa.Column('combo_config', sa.JSON(), nullable=True))

    # Verify if menu-desayunos exists
    cat_exists = conn.execute(
        sa.text("SELECT id FROM categories WHERE id = 'menu-desayunos'")
    ).fetchone()

    target_category_id = 'menu-desayunos' if cat_exists else None
    if not target_category_id:
        # Fallback to any category matching desayuno or merienda
        fallback = conn.execute(
            sa.text("SELECT id FROM categories WHERE name LIKE '%desayun%' OR name LIKE '%meriend%' LIMIT 1")
        ).fetchone()
        if fallback:
            target_category_id = fallback[0]

    for combo in COMBOS_DATA:
        cid = target_category_id or combo["category_id"]
        existing = conn.execute(
            sa.text("SELECT id FROM products WHERE id = :id"),
            {"id": combo["id"]}
        ).fetchone()

        cfg_json = json.dumps(combo["combo_config"], ensure_ascii=False)
        cats_json = json.dumps(combo["public_categories"], ensure_ascii=False)

        if not existing:
            conn.execute(
                sa.text("""
                    INSERT INTO products (
                        id, category_id, name, description, price, available, in_menu,
                        emoji, image, archived, price_pending, public_categories,
                        stock_mode, cone_links, sizes, extras, flavor_options, combo_config
                    ) VALUES (
                        :id, :category_id, :name, :description, 0.00, 1, 1,
                        '', NULL, 0, 1, :public_categories,
                        'manual', '{}', '[]', '[]', '[]', :combo_config
                    )
                """),
                {
                    "id": combo["id"],
                    "category_id": cid,
                    "name": combo["name"],
                    "description": combo["description"],
                    "public_categories": cats_json,
                    "combo_config": cfg_json
                }
            )
        else:
            conn.execute(
                sa.text("""
                    UPDATE products
                    SET combo_config = :combo_config,
                        description = :description,
                        in_menu = 1,
                        archived = 0
                    WHERE id = :id
                """),
                {
                    "id": combo["id"],
                    "combo_config": cfg_json,
                    "description": combo["description"]
                }
            )

def downgrade():
    conn = op.get_bind()
    columns = [c['name'] for c in sa.inspect(conn).get_columns('products')]
    if 'combo_config' in columns:
        op.drop_column('products', 'combo_config')
