from pathlib import Path
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, Header
from pydantic import Field, field_validator
from sqlalchemy import select, func
from .models import Category, Product, Table, User, Flavor, StockItem, StockMovement, OrderItem, UploadedImage
from .db import get_db
from .auth import current_session
from .schemas import StrictModel
from .services import fail, once, uid

router = APIRouter(prefix="/api")

def admin(auth=Depends(current_session)):
    if auth[0].role != 'admin':
        fail('Solo el administrador puede gestionar la carta.', 403)
    return auth

def categories(db):
    return [
        dict(
            id=c.id,
            name=c.name,
            image=c.image,
            order=c.sort_order,
            visible=c.public_visible,
            note=c.note,
            stockArea=c.stock_area,
        )
        for c in db.scalars(select(Category).order_by(Category.sort_order, Category.name))
    ]

@router.get('/public/menu/{number}')
def menu(number: int, db=Depends(get_db)):
    t = db.get(Table, number)
    if not t or not t.active:
        fail('Este enlace de mesa no es válido. Consultá a la moza.', 404)
    from .main import catalog
    data = catalog(db, None)
    cats = [c for c in categories(db) if c['visible']]
    visible = {c['name'] for c in cats}
    data['products'] = [
        p for p in data['products']
        if p.get('inMenu', True) and (p['category'] in visible or set(p['publicCategories']) & {c['id'] for c in cats})
    ]
    active_categories = {p['category'] for p in data['products']}
    for p in data['products']:
        active_categories.update(p.get('publicCategories', []))
    data['categories'] = [
        {k: v for k, v in c.items() if k != 'visible'}
        for c in cats
        if c['name'] in active_categories or c['id'] in active_categories
    ]
    for p in data['products']:
        p.pop('availabilityReason', None)
        if p['pricePending']:
            p['price'] = None
    return dict(table=number, **data)

@router.get('/menu-management')
def management(db=Depends(get_db), auth=Depends(admin)):
    backend_dir = Path(__file__).resolve().parent.parent
    root = backend_dir.parent / 'frontend/public/menu'
    upload_dir = backend_dir / 'uploads/menu'

    EXCLUDED_IMAGES = {
        'nanifer.webp', 'bebidas.jpg', 'meriendas2.webp', 'sintacc.webp',
        'cenas.webp', 'coffebreak.jpg'
    }

    images = []
    # 1. Persistent uploaded images from database (survives container redeployments)
    try:
        for row in db.scalars(select(UploadedImage).order_by(UploadedImage.created_at.desc())):
            img_url = f'/api/uploads/menu/{row.filename}'
            if img_url not in images:
                images.append(img_url)
    except Exception:
        pass

    # 2. Local uploads directory
    if upload_dir.is_dir():
        for p in sorted(upload_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if p.is_file() and p.suffix.lower() in ('.webp', '.jpg', '.jpeg', '.png'):
                img_url = f'/api/uploads/menu/{p.name}'
                if img_url not in images:
                    images.append(img_url)

    # 2. Bundled menu catalog images (excluding salon background and hero covers)
    if root.is_dir():
        for p in sorted(root.iterdir()):
            if p.is_file() and p.suffix.lower() in ('.webp', '.jpg', '.jpeg', '.png'):
                if p.name not in EXCLUDED_IMAGES:
                    img_path = f'/menu/{p.name}'
                    if img_path not in images:
                        images.append(img_path)
    return dict(
        categories=categories(db),
        products=[
            dict(
                id=p.id,
                name=p.name,
                image=p.image,
                description=p.description,
                categoryId=p.category_id,
                publicCategories=p.public_categories or [],
                price=None if p.price_pending else str(p.price),
                available=p.available,
                archived=p.archived,
                inMenu=p.in_menu,
                order=p.sort_order,
                manageStock=p.stock_mode == 'unit',
                sizes=p.sizes or [],
                flavorOptions=p.flavor_options or [],
                comboConfig=p.combo_config or {},
            )
            for p in db.scalars(select(Product).order_by(Product.sort_order, Product.name, Product.id))
        ],
        flavors=[
            dict(
                id=f.id,
                name=f.name,
                available=f.available,
            )
            for f in db.scalars(select(Flavor).order_by(Flavor.name))
        ],
        images=images,
    )

class CategoryIn(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    image: str | None = None
    order: int = Field(ge=0, le=9999)
    visible: bool
    note: str = Field(default="", max_length=500)
    stockArea: Literal['other', 'beverages', 'kiosk', 'candies', 'manual'] = 'other'

    @field_validator('name')
    @classmethod
    def name_valid(cls, v):
        if not v.strip():
            raise ValueError('Ingresá un nombre.')
        return v.strip()

class PhotoIn(StrictModel):
    image: str | None = None

def image_path(value):
    if not value:
        return None
    import re
    if not (
        re.fullmatch(r'/api/uploads/menu/[a-zA-Z0-9_-]+\.(webp|jpg|jpeg|png)', value)
        or re.fullmatch(r'/menu/[a-zA-Z0-9_-]+\.(webp|jpg|jpeg|png)', value)
    ):
        fail('Usá una foto válida de la carta o subí una desde el panel.', 422)
    return value

@router.post('/menu-management/categories')
def create_category(data: CategoryIn, key: str = Header(alias='Idempotency-Key'), db=Depends(get_db), auth=Depends(admin)):
    db.scalar(select(User).where(User.id == auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Category.id).where(Category.name == data.name)):
            fail('Ya existe una categoría con ese nombre.', 409)
        c = Category(
            id=uid(),
            name=data.name,
            image=image_path(data.image),
            sort_order=data.order,
            public_visible=data.visible,
            note=data.note,
            stock_area=data.stockArea,
        )
        db.add(c)
        db.flush()
        return {'id': c.id}
    result = once(db, key, 'catalog-category:' + auth[0].id, data.model_dump(), save)
    db.commit()
    return result

@router.put('/menu-management/categories/{id}')
def update_category(id: str, data: CategoryIn, db=Depends(get_db), auth=Depends(admin)):
    c = db.scalar(select(Category).where(Category.id == id).with_for_update())
    if not c:
        fail('Categoría inexistente.', 404)
    if db.scalar(select(Category.id).where(Category.name == data.name, Category.id != id)):
        fail('Ya existe una categoría con ese nombre.', 409)
    c.name = data.name
    c.image = image_path(data.image)
    c.sort_order = data.order
    c.public_visible = data.visible
    c.note = data.note
    c.stock_area = data.stockArea
    db.commit()
    return {'saved': True}

@router.delete('/menu-management/categories/{id}')
def delete_category(id: str, db=Depends(get_db), auth=Depends(admin)):
    c = db.scalar(select(Category).where(Category.id == id).with_for_update())
    if not c:
        fail('Categoría inexistente.', 404)
    product_count = db.scalar(select(func.count(Product.id)).where(Product.category_id == id))
    if product_count > 0:
        fail(f'No se puede eliminar la categoría porque tiene {product_count} producto(s) asociado(s). Reasignalos o eliminalos primero.', 409)
    db.delete(c)
    db.commit()
    return {'id': id, 'deleted': True}

@router.put('/menu-management/products/{id}/photo')
def update_photo(id: str, data: PhotoIn, db=Depends(get_db), auth=Depends(admin)):
    p = db.get(Product, id)
    if not p:
        fail('Producto inexistente.', 404)
    p.image = image_path(data.image)
    db.commit()
    return {'saved': True}

class PhotoUploadIn(StrictModel):
    data: str
    name: str | None = None

@router.post('/menu-management/upload-photo')
def upload_photo(body: PhotoUploadIn, db=Depends(get_db), auth=Depends(admin)):
    import base64
    import io
    import re
    import time
    import unicodedata
    from PIL import Image, ImageOps

    raw_data = body.data.strip()
    if not raw_data.startswith('data:image/'):
        fail('Formato de imagen inválido. Debe ser una imagen en base64.', 422)

    try:
        header, b64_str = raw_data.split(';base64,', 1)
        image_bytes = base64.b64decode(b64_str)
    except Exception:
        fail('No se pudo procesar la imagen enviada.', 422)

    if len(image_bytes) > 15 * 1024 * 1024:
        fail('La imagen supera el límite máximo permitido (15 MB).', 422)

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
    except Exception:
        fail('El archivo enviado no es una imagen válida.', 422)

    TARGET_SIZE = 700
    canvas = Image.new('RGB', (TARGET_SIZE, TARGET_SIZE), (255, 255, 255))
    pad = int(TARGET_SIZE * 0.04)
    max_inner = TARGET_SIZE - (pad * 2)

    scale = min(max_inner / img.width, max_inner / img.height)
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))

    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset_x = (TARGET_SIZE - new_w) // 2
    offset_y = (TARGET_SIZE - new_h) // 2

    if resized.mode in ('RGBA', 'LA') or (resized.mode == 'P' and 'transparency' in resized.info):
        canvas.paste(resized, (offset_x, offset_y), resized.convert('RGBA'))
    else:
        canvas.paste(resized, (offset_x, offset_y))

    raw_name = (body.name or 'producto').strip().lower()
    clean_name = unicodedata.normalize('NFKD', raw_name).encode('ascii', 'ignore').decode('ascii')
    clean_name = re.sub(r'[^a-z0-9]+', '-', clean_name).strip('-')
    if not clean_name:
        clean_name = 'producto'

    timestamp = int(time.time() * 1000) % 100000000
    filename = f"{clean_name[:40]}-{timestamp}.webp"

    buf = io.BytesIO()
    canvas.save(buf, 'WEBP', quality=88, method=6)
    webp_bytes = buf.getvalue()

    backend_dir = Path(__file__).resolve().parent.parent
    upload_dir = backend_dir / 'uploads' / 'menu'
    upload_dir.mkdir(parents=True, exist_ok=True)
    out_path = upload_dir / filename
    out_path.write_bytes(webp_bytes)

    # También guardar en frontend/public/menu y dist/menu si están disponibles
    try:
        f_pub = backend_dir.parent / 'frontend' / 'public' / 'menu'
        if f_pub.parent.is_dir():
            f_pub.mkdir(parents=True, exist_ok=True)
            (f_pub / filename).write_bytes(webp_bytes)
    except Exception:
        pass

    try:
        f_dist = backend_dir.parent / 'frontend' / 'dist' / 'menu'
        if f_dist.parent.is_dir():
            f_dist.mkdir(parents=True, exist_ok=True)
            (f_dist / filename).write_bytes(webp_bytes)
    except Exception:
        pass

    # Guardar en base de datos para persistir entre redeploys de contenedores
    try:
        db_img = db.get(UploadedImage, filename)
        if not db_img:
            db_img = UploadedImage(filename=filename, data=webp_bytes, mime_type="image/webp")
            db.add(db_img)
        else:
            db_img.data = webp_bytes
            db_img.mime_type = "image/webp"
        db.commit()
    except Exception:
        db.rollback()

    size_kb = round(len(webp_bytes) / 1024, 1)

    return {
        'image': f'/api/uploads/menu/{filename}',
        'filename': filename,
        'sizeKb': size_kb,
    }

@router.get('/uploads/menu/{filename}')
@router.get('/menu-images/{filename}')
def serve_uploaded_menu_image(filename: str, db=Depends(get_db)):
    import re
    from fastapi.responses import FileResponse, Response
    from fastapi import HTTPException

    if not re.fullmatch(r"[a-zA-Z0-9_-]+\.(webp|jpg|jpeg|png)", filename):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")

    backend_dir = Path(__file__).resolve().parent.parent
    repo_root = backend_dir.parent

    candidates = [
        backend_dir / 'uploads' / 'menu' / filename,
        repo_root / 'frontend' / 'public' / 'menu' / filename,
        repo_root / 'frontend' / 'dist' / 'menu' / filename,
    ]

    for candidate in candidates:
        if candidate.is_file():
            media = "image/webp" if filename.endswith(".webp") else "image/jpeg" if filename.endswith((".jpg", ".jpeg")) else "image/png"
            return FileResponse(
                path=candidate,
                media_type=media,
                headers={"Cache-Control": "public, max-age=31536000"}
            )

    # Si el archivo no está en disco (por ejemplo tras recrear el contenedor en un redeploy),
    # recuperarlo de la base de datos y recrear el cache local en disco.
    try:
        db_img = db.get(UploadedImage, filename)
        if db_img and db_img.data:
            try:
                cache_file = backend_dir / 'uploads' / 'menu' / filename
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                cache_file.write_bytes(db_img.data)
            except Exception:
                pass
            return Response(
                content=db_img.data,
                media_type=db_img.mime_type or "image/webp",
                headers={"Cache-Control": "public, max-age=31536000"}
            )
    except Exception:
        pass

    raise HTTPException(status_code=404, detail="Imagen no encontrada.")

class ProductIn(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default='', max_length=500)
    categoryId: str
    publicCategories: list[str] = Field(default_factory=list)
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    image: str | None = None
    available: bool = True
    inMenu: bool = True
    order: int = Field(default=0, ge=0, le=9999)
    manageStock: bool | None = None
    sizes: list = Field(default_factory=list)
    flavorOptions: list[str] = Field(default_factory=list)
    comboConfig: dict | None = None

    @field_validator('name')
    @classmethod
    def trimmed(cls, v):
        if not v.strip():
            raise ValueError('Ingresá el nombre del producto.')
        return v.strip()

def apply_product(db, p, data: ProductIn):
    if not db.get(Category, data.categoryId):
        fail('Elegí una categoría existente.', 422)
    p.name = data.name
    p.description = data.description.strip()
    p.category_id = data.categoryId
    p.public_categories = [cid for cid in dict.fromkeys(data.publicCategories) if cid and cid != data.categoryId]
    p.price_pending = data.price is None
    p.price = data.price if data.price is not None else Decimal(0)
    p.image = image_path(data.image)
    p.available = data.available
    p.in_menu = data.inMenu
    p.sort_order = data.order
    p.sizes = data.sizes
    p.flavor_options = [opt.strip() for opt in data.flavorOptions if opt.strip()]
    if data.comboConfig is not None:
        p.combo_config = data.comboConfig
    if data.manageStock is not None:
        if data.manageStock:
            p.stock_mode = 'unit'
            row = db.scalar(select(StockItem).where(StockItem.product_id == p.id))
            if not row:
                row = StockItem(id=uid(), product_id=p.id, kind='unit', name=p.name, unit='unidades', quantity=None, opened=0, version=0)
                db.add(row)
                db.flush()
        else:
            p.stock_mode = 'manual'

@router.post('/menu-management/products')
def create_product(data: ProductIn, key: str = Header(alias='Idempotency-Key'), db=Depends(get_db), auth=Depends(admin)):
    db.scalar(select(User).where(User.id == auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Product.id).where(Product.name == data.name, Product.category_id == data.categoryId, Product.archived == False)):
            fail('Ya existe este producto en la categoría. Editalo desde la lista.', 409)
        p = Product(id=uid(), public_categories=[], sizes=[], extras=[], cone_links={}, in_menu=data.inMenu, combo_config={})
        apply_product(db, p, data)
        db.add(p)
        db.flush()
        return {'id': p.id}
    result = once(db, key, 'catalog-product:' + auth[0].id, data.model_dump(mode='json'), save)
    db.commit()
    return result

@router.put('/menu-management/products/{id}')
def update_product(id: str, data: ProductIn, db=Depends(get_db), auth=Depends(admin)):
    p = db.scalar(select(Product).where(Product.id == id).with_for_update())
    if not p:
        fail('Producto inexistente.', 404)
    apply_product(db, p, data)
    db.commit()
    return {'id': id}

class ProductReorderIn(StrictModel):
    productIds: list[str]

@router.put('/menu-management/products-reorder')
def reorder_products(data: ProductReorderIn, db=Depends(get_db), auth=Depends(admin)):
    for idx, pid in enumerate(data.productIds):
        p = db.get(Product, pid)
        if p:
            p.sort_order = idx
    db.commit()
    return {'saved': True, 'count': len(data.productIds)}

@router.post('/menu-management/products/{id}/toggle-menu')
def toggle_menu_product(id: str, db=Depends(get_db), auth=Depends(admin)):
    p = db.scalar(select(Product).where(Product.id == id).with_for_update())
    if not p:
        fail('Producto inexistente.', 404)
    p.in_menu = not p.in_menu
    if p.in_menu:
        cat = db.get(Category, p.category_id)
        if cat and not cat.public_visible:
            cat.public_visible = True
    db.commit()
    return {'id': id, 'inMenu': p.in_menu}

@router.delete('/menu-management/products/{id}')
def delete_product(id: str, permanent: bool = False, db=Depends(get_db), auth=Depends(admin)):
    p = db.scalar(select(Product).where(Product.id == id).with_for_update())
    if not p:
        fail('Producto inexistente.', 404)
    if permanent:
        order_count = db.scalar(select(func.count(OrderItem.id)).where(OrderItem.product_id == id))
        if order_count > 0:
            fail('No se puede eliminar definitivamente el producto porque figura en ventas o pedidos registrados. Podés mantenerlo retirado de la carta.', 409)
        stock = db.scalar(select(StockItem).where(StockItem.product_id == id).with_for_update())
        if stock:
            move_count = db.scalar(select(func.count(StockMovement.id)).where(StockMovement.stock_id == stock.id))
            if move_count > 0:
                fail('No se puede eliminar definitivamente el producto porque tiene movimientos de stock registrados. Mantenelo retirado de la carta.', 409)
            db.delete(stock)
            db.flush()
        db.delete(p)
        db.commit()
        return {'id': id, 'deleted': True}
    p.archived = True
    db.commit()
    return {'id': id, 'archived': True}

@router.post('/menu-management/products/{id}/restore')
def restore_product(id: str, db=Depends(get_db), auth=Depends(admin)):
    p = db.scalar(select(Product).where(Product.id == id).with_for_update())
    if not p:
        fail('Producto inexistente.', 404)
    p.archived = False
    db.commit()
    return {'id': id}

class FlavorIn(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    available: bool = True

    @field_validator('name')
    @classmethod
    def clean_name(cls, v):
        v = ' '.join(v.split())
        if not v:
            raise ValueError('Ingresá el nombre del sabor.')
        return v

@router.post('/menu-management/flavors')
def create_flavor(data: FlavorIn, key: str = Header(alias='Idempotency-Key'), db=Depends(get_db), auth=Depends(admin)):
    db.scalar(select(User).where(User.id == auth[0].id).with_for_update())
    def save():
        if db.scalar(select(Flavor.id).where(Flavor.name == data.name)):
            fail('Ya existe un sabor con ese nombre.', 409)
        f = Flavor(id=uid(), name=data.name, available=data.available)
        db.add(f)
        db.flush()
        row = StockItem(id=uid(), flavor_id=f.id, kind='containers', name=f.name, unit='recipientes', quantity=None, opened=0, version=0)
        db.add(row)
        db.flush()
        return {'id': f.id, 'name': f.name, 'available': f.available, 'stockId': row.id}
    result = once(db, key, 'catalog-flavor:' + auth[0].id, data.model_dump(), save)
    db.commit()
    return result

@router.put('/menu-management/flavors/{id}')
def update_flavor(id: str, data: FlavorIn, db=Depends(get_db), auth=Depends(admin)):
    f = db.scalar(select(Flavor).where(Flavor.id == id).with_for_update())
    if not f:
        fail('Sabor inexistente.', 404)
    if db.scalar(select(Flavor.id).where(Flavor.name == data.name, Flavor.id != id)):
        fail('Ya existe otro sabor con ese nombre.', 409)
    f.name = data.name
    f.available = data.available
    stock = db.scalar(select(StockItem).where(StockItem.flavor_id == id).with_for_update())
    if stock:
        stock.name = data.name
    db.commit()
    return {'id': id, 'name': f.name, 'available': f.available}

@router.delete('/menu-management/flavors/{id}')
def delete_flavor(id: str, db=Depends(get_db), auth=Depends(admin)):
    f = db.scalar(select(Flavor).where(Flavor.id == id).with_for_update())
    if not f:
        fail('Sabor inexistente.', 404)
    stock = db.scalar(select(StockItem).where(StockItem.flavor_id == id).with_for_update())
    if stock:
        move_count = db.scalar(select(func.count(StockMovement.id)).where(StockMovement.stock_id == stock.id))
        if move_count > 0:
            fail('No se puede eliminar el sabor porque tiene movimientos de stock registrados. Podés marcarlo como no disponible para que no se ofrezca en la carta.', 409)
        db.delete(stock)
        db.flush()
    db.delete(f)
    db.commit()
    return {'id': id, 'deleted': True}
